import { useInfiniteQuery } from "@tanstack/react-query";
import { listAssets, ApiError } from "@/api/client";
import type { Asset, AssetPage, AssetQuery } from "@/lib/types";

interface UseAssetsOptions extends Omit<AssetQuery, "cursor"> {
  enabled?: boolean;
}

export function useAssets(options: UseAssetsOptions) {
  const {
    q,
    status,
    kind,
    tag,
    collectionId,
    owner,
    sort,
    limit = 36,
    enabled = true,
  } = options;

  const queryKey = [
    "assets",
    {
      q: q?.trim() || undefined,
      status:
        status && status.length > 0 ? [...status].sort().join(",") : undefined,
      kind: kind && kind.length > 0 ? [...kind].sort().join(",") : undefined,
      tag: tag && tag.length > 0 ? [...tag].sort().join(",") : undefined,
      collectionId: collectionId || undefined,
      owner: owner || undefined,
      sort: sort || "updatedAt:desc",
      limit,
    },
  ] as const;

  const infiniteQuery = useInfiniteQuery<AssetPage, ApiError>({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      return listAssets(
        {
          q: q?.trim() || undefined,
          status,
          kind,
          tag,
          collectionId,
          owner,
          sort,
          limit,
          cursor: pageParam as string | undefined,
        },
        signal,
      );
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    // Keep data fresh, retry handled by client.ts
    staleTime: 30_000,
  });

  const items: Asset[] = infiniteQuery.data
    ? infiniteQuery.data.pages.flatMap((page) => page.items)
    : [];

  const total = infiniteQuery.data?.pages[0]?.total ?? 0;

  const isAbortError =
    (infiniteQuery.error instanceof DOMException &&
      infiniteQuery.error.name === "AbortError") ||
    infiniteQuery.error?.message?.includes("aborted");

  return {
    items,
    total,
    isLoading: infiniteQuery.isLoading,
    isFetching: infiniteQuery.isFetching,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: Boolean(infiniteQuery.hasNextPage),
    fetchNextPage: infiniteQuery.fetchNextPage,
    isError: infiniteQuery.isError && !isAbortError,
    error: isAbortError ? null : infiniteQuery.error,
    refetch: infiniteQuery.refetch,
  };
}
