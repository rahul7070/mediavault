import type {
  Asset,
  AssetPage,
  AssetQuery,
  BulkResult,
  Facets,
  Stats,
  CollectionItem,
} from "@/lib/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  readonly isRetryable: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;

    // Structural determination of retryability:
    // 503, 429, 500 (write_failed), and status 0 (network drops) are retryable.
    // 400, 404, 409 (version_conflict), 422 (validation/legal_hold) are NOT retryable.
    if (status === 503 || status === 429 || status === 500 || status === 0) {
      this.isRetryable = true;
    } else {
      this.isRetryable = false;
    }
  }
}

function toSearchParams(query: AssetQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status?.length) params.set("status", query.status.join(","));
  if (query.kind?.length) params.set("kind", query.kind.join(","));
  if (query.tag?.length) params.set("tag", query.tag.join(","));
  if (query.collectionId) params.set("collectionId", query.collectionId);
  if (query.owner) params.set("owner", query.owner);
  if (query.sort) params.set("sort", query.sort);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params.toString();
}

/** In-flight GET request de-duplication cache */
const inFlightRequests = new Map<string, Promise<unknown>>();

interface RequestOptions extends RequestInit {
  maxRetries?: number;
  baseDelayMs?: number;
  deduplicate?: boolean;
}

const sleep = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 300,
    deduplicate = options.method === undefined || options.method === "GET",
    ...init
  } = options;

  // In-flight GET de-duplication
  if (deduplicate && (!init.method || init.method === "GET")) {
    const key = `${init.method ?? "GET"}:${path}`;

    if (init.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const existing = inFlightRequests.get(key);
    if (existing) {
      return new Promise<T>((resolve, reject) => {
        if (init.signal?.aborted) {
          return reject(new DOMException("Aborted", "AbortError"));
        }
        const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        init.signal?.addEventListener("abort", onAbort, { once: true });
        existing.then(
          (val) => {
            init.signal?.removeEventListener("abort", onAbort);
            resolve(val as T);
          },
          (err) => {
            init.signal?.removeEventListener("abort", onAbort);
            // If the cached request was aborted by an earlier caller, but THIS caller is not aborted, retry freshly!
            if (
              err instanceof DOMException &&
              err.name === "AbortError" &&
              !init.signal?.aborted
            ) {
              request<T>(path, { ...options, deduplicate: false }).then(
                resolve,
                reject,
              );
            } else {
              reject(err);
            }
          },
        );
      });
    }

    const promise = executeRequestWithRetry<T>(
      path,
      init,
      maxRetries,
      baseDelayMs,
    ).finally(() => {
      inFlightRequests.delete(key);
    });

    if (init.signal) {
      init.signal.addEventListener(
        "abort",
        () => {
          inFlightRequests.delete(key);
        },
        { once: true },
      );
    }

    inFlightRequests.set(key, promise);
    return promise;
  }

  return executeRequestWithRetry<T>(path, init, maxRetries, baseDelayMs);
}

async function executeRequestWithRetry<T>(
  path: string,
  init: RequestInit,
  maxRetries: number,
  baseDelayMs: number,
): Promise<T> {
  let attempt = 0;

  while (true) {
    if (init.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      const res = await fetch(path, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      if (!res.ok) {
        let code = "http_error";
        let message = res.statusText;
        try {
          const body = await res.json();
          if (body?.error) {
            code = body.error.code ?? code;
            message = body.error.message ?? message;
          }
        } catch {
          /* non-JSON response */
        }

        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfter = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : undefined;

        const error = new ApiError(res.status, code, message, retryAfter);

        if (error.isRetryable && attempt < maxRetries) {
          attempt++;
          // Exponential backoff with jitter, honoring Retry-After
          const delay = retryAfter
            ? retryAfter * 1000 + Math.random() * 200
            : Math.min(
                baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200,
                4000,
              );

          await sleep(delay, init.signal);
          continue;
        }

        throw error;
      }

      if (res.status === 204) {
        return null as unknown as T;
      }

      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }

      // If it's already an ApiError (from non-ok response) that wasn't retried, rethrow
      if (err instanceof ApiError) {
        throw err;
      }

      // Network error (offline, connection dropped, DNS failure)
      const networkError = new ApiError(
        0,
        "network_error",
        err instanceof Error ? err.message : "Network connection failure",
      );

      if (attempt < maxRetries) {
        attempt++;
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200,
          3000,
        );
        await sleep(delay, init.signal);
        continue;
      }

      throw networkError;
    }
  }
}

export function listAssets(
  query: AssetQuery,
  signal?: AbortSignal,
): Promise<AssetPage> {
  return request<AssetPage>(`/api/assets?${toSearchParams(query)}`, { signal });
}

export function getAsset(id: string, signal?: AbortSignal): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, { signal });
}

export function getAssetsByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<{ items: Asset[]; missing: string[] }> {
  return request(`/api/assets/batch?ids=${ids.join(",")}`, { signal });
}

export function updateAsset(
  id: string,
  version: number,
  patch: Partial<Pick<Asset, "name" | "status" | "tags">>,
  signal?: AbortSignal,
): Promise<Asset> {
  return request<Asset>(`/api/assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ version, patch }),
    signal,
    // Do not retry 409 version_conflict or 422; 500 write_failed will be retried automatically
    maxRetries: 2,
  });
}

export function bulkSetStatus(
  ids: string[],
  status: Asset["status"],
  signal?: AbortSignal,
): Promise<BulkResult> {
  return request<BulkResult>("/api/assets/bulk-status", {
    method: "POST",
    body: JSON.stringify({ ids, status }),
    signal,
    maxRetries: 2,
  });
}

/**
 * Executes bulk status updates in chunks of <= 50 with bounded concurrency (max 2 parallel chunks)
 * to respect backend rate limits and the 50-ID per request ceiling.
 */
export async function bulkSetStatusChunked(
  ids: string[],
  status: Asset["status"],
  signal?: AbortSignal,
  onChunkComplete?: (chunkResult: BulkResult) => void,
): Promise<BulkResult> {
  const CHUNK_SIZE = 50;
  const CONCURRENCY_LIMIT = 2;

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }

  const combinedResult: BulkResult = {
    results: [],
    applied: 0,
    failed: 0,
  };

  let activeIndex = 0;

  async function worker(): Promise<void> {
    while (activeIndex < chunks.length) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const chunkIndex = activeIndex++;
      const chunkIds = chunks[chunkIndex];
      if (!chunkIds || chunkIds.length === 0) break;

      const res = await bulkSetStatus(chunkIds, status, signal);
      combinedResult.results.push(...res.results);
      combinedResult.applied += res.applied;
      combinedResult.failed += res.failed;

      onChunkComplete?.(res);
    }
  }

  const workers = Array.from(
    { length: Math.min(chunks.length, CONCURRENCY_LIMIT) },
    () => worker(),
  );

  await Promise.all(workers);

  return combinedResult;
}

export function getFacets(signal?: AbortSignal): Promise<Facets> {
  return request<Facets>("/api/facets", { signal });
}

export function getCollections(
  signal?: AbortSignal,
): Promise<{ items: CollectionItem[] }> {
  return request<{ items: CollectionItem[] }>("/api/collections", { signal });
}

export function getStats(signal?: AbortSignal): Promise<Stats> {
  return request<Stats>("/api/stats", { signal, maxRetries: 1 });
}

export const thumbnailUrl = (id: string) => `/api/thumb/${id}.svg`;
