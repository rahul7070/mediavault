# Submission

## Video walkthrough

Paste your Loom (or equivalent) link here. 5–10 minutes.

**Video Link:** https://vimeo.com/1227942313
**Deployed Link:** https://mediavault-eta.vercel.app

---

## How to run it

Prerequisites: Node.js >= 20.11

```bash
# 1. Install dependencies
npm install

# 2. Run mock API and Vite client concurrently (Chaos & Latency defaults ON)
npm run dev

# 3. Open in browser:
# App:      http://localhost:5173
# Health:   http://localhost:8787/api/health
```

To run typecheck and production build:
```bash
npm run typecheck
npm run build
```

## Time spent

**Total:** ~11 focused hours
- **1.5h:** Baseline defect analysis, API contract modeling (`API.md`), threat modeling hostile API behaviors.
- **2.5h:** Resilient API layer (`src/api/client.ts`): structured `ApiError`, backoff with full jitter, `Retry-After`, de-duplication, and chunked bulk updates with bounded concurrency.
- **2.5h:** Virtualization and scale (`src/features/assets/AssetGrid.tsx` & `AssetCard.tsx`): TanStack Virtual implementation, responsive columns, zero-layout-shift thumbnail fallback, and strict re-render isolation.
- **2.0h:** Bulk actions, optimistic UI, `207 Multi-Status` per-item rollback, and `409 Version Conflict` recovery flow.
- **1.5h:** Accessibility (a11y): roving tabindex, keyboard navigation (Arrows, Space, Enter, Shift+Arrow), screen reader `aria-live` regions, and focus management.
- **1.0h:** Design system & polish (`src/styles.css`): WCAG AA contrast tokens, status progression design (icon + shape + color), performance profiling, and bundle verification.

---

## Baseline defects found

| # | Defect | Where | Fixed / left / out of scope |
|---|---|---|---|
| 1 | Bulk update sends >50 ids in one call, causing immediate 400 `too_many_ids` | `App.tsx: applyBulkStatus` | **Fixed** via `bulkSetStatusChunked` (chunk size ≤ 50, bounded concurrency = 2) |
| 2 | Search race condition: short-prefix queries (e.g. `tra`) have higher latency and overwrite newer results | `useAssets.ts` / `App.tsx` | **Fixed** via TanStack Query keying and `AbortController` cancellation |
| 3 | In-flight requests are never cancelled when parameters change | `client.ts` / `useAssets.ts` | **Fixed** by wiring `AbortSignal` through all API client methods |
| 4 | Rapid typing fires requests on every keystroke, exhausting the 80 req/10s rate limit (`429`) | `App.tsx: input onChange` | **Fixed** via 250ms debounced search query state |
| 5 | App loads only first 24 items, ignoring `nextCursor` and the remaining 12,400 assets | `useAssets.ts` | **Fixed** via `useInfiniteQuery` with cursor pagination and infinite scrolling |
| 6 | Changing filters with an existing cursor causes server error 400 `stale_cursor` | `useAssets.ts` | **Fixed** by resetting pagination state and dropping cursors upon filter change |
| 7 | Toggling one card's checkbox re-renders all rendered cards in the grid | `AssetGrid.tsx` | **Fixed** by memoizing `AssetCard` with `React.memo` and localized selection props |
| 8 | Detail panel save does not update asset in the grid (`handleSaved` was a no-op comment) | `App.tsx: handleSaved` | **Fixed** by updating the TanStack Query cache in-place with `setQueriesData` |
| 9 | Missing thumbnail (404) renders broken image and causes Cumulative Layout Shift (CLS) | `AssetGrid.tsx` | **Fixed** by pre-checking `hasThumbnail`, 16:10 aspect ratio wrapper, and SVG fallback |
| 10 | Errors flattened into generic string (`${res.status}: ${detail}`), losing error codes and retry info | `client.ts: request` | **Fixed** with structured `ApiError` exposing `status`, `code`, and `retryAfter` |
| 11 | No exponential backoff, jitter, or `Retry-After` handling for transient 503/429 errors | `client.ts` | **Fixed** with exponential backoff, jitter, and automatic `Retry-After` header parsing |
| 12 | Grid is unreachable via keyboard; no roving tabindex, arrow navigation, or focus trapping | `AssetGrid.tsx` | **Fixed** with roving tabindex, arrow key navigation, Space toggle, and Enter open |
| 13 | Opening detail panel does not manage focus; closing does not restore focus to origin card | `AssetDetail.tsx` | **Fixed** with auto-focus on mount, Escape key listener, and focus restore |
| 14 | Uncaught component runtime errors crash the entire React application | `main.tsx` / `App.tsx` | **Fixed** with top-level `ErrorBoundary` providing user-friendly recovery |

---

## Key decisions

**Data fetching and caching**
- **Decision:** Adopted `@tanstack/react-query` (v5).
- **Rejected:** Custom `useEffect` / manual cache or naive Redux store.
- **Rationale:** React Query provides battle-tested query cancellation (`AbortSignal`), automatic cache de-duplication, structural sharing, and straightforward cache manipulation (`setQueriesData`) for optimistic updates and SSE real-time events.

**Stale response handling**
- **Decision:** Combined `AbortController` cancellation with TanStack Query's query key hashing.
- **Rejected:** Ignoring older promises with incrementing sequence IDs without aborting.
- **Rationale:** Aborting in-flight requests frees browser connection slots and prevents wasted server compute, completely eliminating the search race condition where slower short prefixes land after newer queries.

**Virtualization approach**
- **Decision:** Adopted `@tanstack/react-virtual` (v3) in a headless responsive grid layout.
- **Rejected:** Heavy prebuilt data tables (AG Grid, MUI DataGrid) or unvirtualized infinite lists.
- **Rationale:** Prebuilt grids were explicitly forbidden by the assessment brief. TanStack Virtual is extremely lightweight (~10 kB), headless, and bounds the rendered DOM tree to strictly the visible viewport (< 50 DOM card nodes) even when 5,000+ assets are loaded.

**Optimistic updates and rollback**
- **Decision:** Local cache snapshotting with per-item partial rollback on `207 Multi-Status`.
- **Rejected:** All-or-nothing rollback or waiting for server confirmation.
- **Rationale:** Brand reviewers bulk-updating 50–200 assets need instantaneous feedback. On a `207` response, rolling back only the failed subset (e.g. `legal-hold` or `conflict`) preserves reviewer progress on successful assets and surfaces an actionable "Retry Conflicts" button.

**Retry and backoff policy**
- **Decision:** Structural discrimination in `ApiError`. Retries `503`, `429`, and `500` (write_failed) using `Math.min(retryAfter * 1000 || (baseDelay * 2^attempt + jitter), 4000)`.
- **Rejected:** String matching on error text or blindly retrying 4xx client errors.
- **Rationale:** Retrying `400`, `409`, or `422` violates HTTP semantics and will never succeed, whereas `503` and `429` explicitly provide `Retry-After` headers designed to protect the server from retry storms.

**State placement and URL sync**
- **Decision:** Custom `useSearchFilters` syncing state with `URLSearchParams`.
- **Rejected:** Keeping state purely in memory or pushing history on every keystroke.
- **Rationale:** Bookmarking and link sharing work out of the box. Keystrokes use `history.replaceState` (avoiding history stack bloat), while explicit filter changes use `history.pushState` to support natural browser Back/Forward navigation.

---

## Performance

*Measurements recorded on Apple Silicon (M-series Mac) in Google Chrome (Latest).*

| Metric | Before | After | How measured |
|---|---|---|---|
| Rendered DOM nodes at 5,000 rows loaded | ~25,000+ nodes (browser stuttering) | **40–60 card nodes** | Chrome DevTools Elements panel & `document.querySelectorAll('.card').length` |
| Cards re-rendered when toggling one selection | All rendered cards (~100%) | **Exactly 1 card** | React DevTools Profiler ("Highlight updates when components render") |
| Longest task during sustained scroll | 142 ms (janky frames) | **12 ms** (smooth 60fps) | Chrome DevTools Performance panel scroll recording |
| Requests fired while typing a 6-character query | 6+ parallel requests (triggered 429) | **1 request** | Chrome DevTools Network panel |
| Production bundle, gzipped | 48 kB baseline | **76.54 kB JS + 4.37 kB CSS** | `npm run build` gzipped output |

**What was the actual bottleneck, and how did you find it?**
1. **Unbounded DOM & Layout Thrashing:** In the baseline, loading pages continuously mounted DOM elements. At 500+ items, calculating layout on scroll caused heavy main-thread tasks (>100ms). Solved via `@tanstack/react-virtual`.
2. **Context-wide Re-renders:** In the baseline, `selectedIds` state lived in `App.tsx` and was passed as a raw `Set` into `AssetGrid.tsx`, causing every card to re-render on any selection change. Solved by isolating `AssetCard` with `React.memo` and feeding it a primitive boolean `isSelected`.

---

## Accessibility

- **Keyboard model:** Implemented a full roving `tabindex` composite widget model on the asset grid (`role="grid"` / `role="row"`). Arrow keys (Up, Down, Left, Right) navigate across columns and rows. `Space` toggles asset selection; `Shift + Arrow` extends continuous range selection; `Enter` opens the detail panel. The detail panel automatically moves focus to its close button upon mount; pressing `Escape` dismisses the panel and restores focus precisely to the triggering card in the grid.
- **How tested:** Tested using keyboard-only navigation (Tab, Arrow keys, Space, Enter, Escape), verified with Chrome DevTools Accessibility Tree, and verified announcements using macOS VoiceOver.
- **Known gaps:** Drag-and-drop selection marquee is not implemented (Shift+Click and Shift+Arrow range selection are provided instead).

---

## Interface decisions

Optimized for an internal brand team reviewing hundreds of media assets under fast-paced deadlines. The interface prioritizes high information density, instant visual recognition, zero layout shift, and clarity under failure states.

- **Visual system:** Built with CSS design tokens in `src/styles.css` defining a curated slate neutral scale, accessible typography hierarchy, high-contrast borders, and elevation tokens (`--shadow-xs` to `--shadow-float`).
- **Status treatment:** The four asset statuses read as a clear logical progression (`draft` [slate outline] → `in_review` [warm amber] → `approved` [emerald green] → `archived` [muted purple]). To support colorblind users (WCAG 1.4.1), each status carries a distinct SVG icon and shape in addition to color.
- **States:**
  - *Loading:* Responsive shimmer skeleton cards matching exact card dimensions.
  - *Empty:* Centered illustration state with a one-click "Reset filters" action.
  - *Error:* Clear alert badge with a "Try again" trigger and retry explanation.
  - *Offline:* Prominent amber banner informing the user that operations will resume automatically when connectivity is restored.
  - *Partial failure:* Dedicated toast summarizing successes, legal-hold blocks, and a direct "Retry conflicts" action.
- **Contrast:** Checked with Chrome DevTools CSS Overview and Lighthouse. All body copy and status badges maintain a contrast ratio > 4.5:1 against their backgrounds (meeting WCAG AA).
- **Copy:** Rewrote machine-like backend strings into human messages: e.g. `429: Too many requests in the last 10 seconds` is translated to *"Rate limit reached. Backing off automatically..."*, and `stale_cursor` is guarded against entirely.

---

---

## Bonus & Optional Tracks Implemented

1. **Offline Write Queueing & Auto-Sync (Task 4 Bonus):**
   - Mutations performed while offline (both single-card edits in `AssetDetail` and multi-item operations in `applyBulkStatus`) update the UI optimistically and are safely stored in a persistent `localStorage` mutation queue.
   - A reactive topbar badge (`N pending sync`) alerts the user to pending changes.
   - When connection is restored (`window.onLine`), the queue automatically flushes with bounded concurrency, updates query caches, and announces the successful sync via screen reader live regions.
2. **Non-Blocking `/api/stats` Header (Optional Track):**
   - Built into `<LibraryStats />` (`src/features/header/LibraryStats.tsx`).
   - The endpoint's synthetic >1.1s latency is decoupled from the main thread via TanStack Query (`staleTime: 60s`).
   - Renders a fixed-height skeleton loader that prevents Cumulative Layout Shift (CLS), smoothly popping in library volume metrics (12,400 assets, 2.0 TB storage, and approved counts) without blocking grid interaction.
3. **Live SSE Updates with Conflict Protection (Optional Track):**
   - Implemented via `useAssetEvents` (`src/hooks/useAssetEvents.ts`) connecting to `GET /api/events`.
   - Incoming `asset.updated` events are merged in-place into query pages, keeping array lengths and virtual scroll indices completely undisturbed (0 scroll jumps).
   - Local edit protection: Server updates for the asset actively open in the detail panel or currently selected in the bulk bar are ignored to prevent clobbering in-progress reviewer workflows.
   - Displays a real-time `Live sync` indicator in the topbar.

---

## Trade-offs and cuts

- **Marquee drag-to-select:** Replaced with standard OS-style Click + Shift+Click and Shift+Arrow range selection, which is snappier and easier to navigate with assistive tech.
- **Persistent IndexedDB vs LocalStorage:** Used `localStorage` for offline mutation queueing rather than IndexedDB to avoid adding bulky external dependencies and keep the gzipped bundle under budget (76 kB).

---

## Critique of the API

1. **Hard 50-ID cap on bulk updates:** Forcing clients to chunk bulk operations into batches of 50 with bounded concurrency creates client-side complexity. An ideal API would accept larger payloads or return a job ID / streaming result, with idempotency keys.
2. **Version requirement on `PATCH` body rather than headers:** Requiring `{ version, patch: { ... } }` in the JSON body rather than standard HTTP concurrency headers (`If-Match` / `ETag`) deviates from REST best practices.
3. **Slow `/api/stats` endpoint:** Artificially delaying library stats (>1.1s) requires separate decoupled polling rather than bundling metadata into standard search responses.

---

## Anything you would like us to look at

- **`src/api/client.ts`**: The clean separation between structural retry logic (exponential backoff with jitter and `Retry-After`) and non-retryable error codes.
- **`src/features/assets/AssetCard.tsx`**: The `React.memo` comparator and thumbnail fallback pipeline that achieves zero Cumulative Layout Shift (CLS) and isolates card re-renders to O(1).
- **`src/App.tsx: applyBulkStatus`**: The optimistic update and partial rollback handler for `207 Multi-Status` responses.
