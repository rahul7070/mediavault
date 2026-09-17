import { useState, useRef, useCallback, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { bulkSetStatusChunked, updateAsset } from '@/api/client';
import { useSearchFilters } from '@/hooks/useSearchFilters';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAssetEvents } from '@/hooks/useAssetEvents';
import { useAssets } from '@/features/assets/useAssets';
import { AssetGrid } from '@/features/assets/AssetGrid';
import { AssetDetail } from '@/features/assets/AssetDetail';
import { LibraryStats } from '@/features/header/LibraryStats';
import { getOfflineQueue, enqueueMutation, removeMutation } from '@/lib/offlineQueue';
import { BulkActionBar } from '@/components/BulkActionBar';
import { NotificationToast, type ToastNotice } from '@/components/NotificationToast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnnouncerProvider, useAnnouncer } from '@/components/LiveAnnouncer';
import { statusLabel } from '@/lib/format';
import type { Asset, AssetStatus, AssetKind, AssetPage, AssetQuery } from '@/lib/types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false, // Handled structurally by client.ts with exponential backoff & jitter
    },
  },
});

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];
const KINDS: AssetKind[] = ['image', 'video', 'document'];
const SORTS: Array<{ value: NonNullable<AssetQuery['sort']>; label: string }> = [
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'createdAt:desc', label: 'Newest created' },
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'name:desc', label: 'Name (Z–A)' },
  { value: 'sizeBytes:desc', label: 'File size (Largest)' },
];

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AnnouncerProvider>
          <MediaVaultDashboard />
        </AnnouncerProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function MediaVaultDashboard() {
  const {
    q,
    debouncedQ,
    status,
    kind,
    sort,
    setQ,
    setStatus,
    setKind,
    setSort,
    resetFilters,
    isFiltered,
  } = useSearchFilters();

  const isOnline = useNetworkStatus();
  const { announce } = useAnnouncer();
  const client = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [notices, setNotices] = useState<ToastNotice[]>([]);
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(() => getOfflineQueue().length);

  // Listen for real-time SSE updates with collision protection and live status indicator
  const { status: sseStatus } = useAssetEvents({
    activeAssetId: activeId,
    selectedIds,
  });

  // Keep pending queue counter reactively updated
  useEffect(() => {
    const handleQueueChange = (e: Event) => {
      const custom = e as CustomEvent<number>;
      setPendingQueueCount(typeof custom.detail === 'number' ? custom.detail : getOfflineQueue().length);
    };
    window.addEventListener('offline_queue_changed', handleQueueChange);
    return () => window.removeEventListener('offline_queue_changed', handleQueueChange);
  }, []);

  // Ref to track element that opened the detail panel so we can restore focus upon close
  const lastActiveTriggerRef = useRef<HTMLElement | null>(null);

  // Fetch infinite assets
  const {
    items,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError,
    error,
    refetch,
  } = useAssets({
    q: debouncedQ,
    status,
    kind,
    sort,
    enabled: isOnline,
  });

  const addNotice = useCallback((notice: Omit<ToastNotice, 'id'>) => {
    const id = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNotices((prev) => [...prev, { ...notice, id }]);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Flush offline queue when reconnected with bounded execution
  const flushOfflineQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0 || !navigator.onLine) return;

    let synced = 0;
    for (const item of queue) {
      try {
        if (item.type === 'single_patch') {
          const updated = await updateAsset(item.assetId, item.version, item.patch);
          client.setQueriesData<InfiniteData<AssetPage>>({ queryKey: ['assets'] }, (oldData) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((p) => ({
                ...p,
                items: p.items.map((a) => (a.id === updated.id ? updated : a)),
              })),
            };
          });
          removeMutation(item.id);
          synced++;
        } else if (item.type === 'bulk_status') {
          const result = await bulkSetStatusChunked(item.assetIds, item.targetStatus);
          removeMutation(item.id);
          synced += result.applied;
        }
      } catch {
        // If conflict or unprocessable error, remove to prevent retry loop
        removeMutation(item.id);
      }
    }

    if (synced > 0) {
      addNotice({
        type: 'success',
        title: 'Offline changes synchronized',
        description: `Successfully synchronized ${synced} queued change${synced > 1 ? 's' : ''} to the server.`,
      });
      announce(`Back online: synchronized ${synced} queued changes to server.`);
    }
  }, [client, addNotice, announce]);

  // Flush queue whenever connection is restored
  useEffect(() => {
    if (isOnline) {
      flushOfflineQueue();
    }
  }, [isOnline, flushOfflineQueue]);

  // Selection handling with Shift+Click Range Selection
  const handleToggleSelect = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastSelectedId && lastSelectedId !== id) {
          // Range selection
          const lastIdx = items.findIndex((a) => a.id === lastSelectedId);
          const currentIdx = items.findIndex((a) => a.id === id);

          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);

            const shouldAdd = !prev.has(id);
            for (let i = start; i <= end; i++) {
              const targetItem = items[i];
              if (targetItem) {
                if (shouldAdd) next.add(targetItem.id);
                else next.delete(targetItem.id);
              }
            }
            return next;
          }
        }

        // Single toggle
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

      setLastSelectedId(id);
    },
    [items, lastSelectedId],
  );

  const handleSelectAllLoaded = useCallback(() => {
    const all = new Set(items.map((a) => a.id));
    setSelectedIds(all);
    announce(`Selected all ${all.size} loaded assets.`);
  }, [items, announce]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
    announce('Cleared asset selection.');
  }, [announce]);

  // Open detail panel and store trigger
  const handleOpenDetail = useCallback((id: string) => {
    lastActiveTriggerRef.current = document.activeElement as HTMLElement;
    setActiveId(id);
  }, []);

  // Close detail panel and restore focus
  const handleCloseDetail = useCallback(() => {
    setActiveId(null);
    setTimeout(() => {
      lastActiveTriggerRef.current?.focus();
    }, 50);
  }, []);

  // Update asset in cache when saved in detail panel
  const handleAssetSaved = useCallback(
    (updated: Asset) => {
      client.setQueriesData<InfiniteData<AssetPage>>({ queryKey: ['assets'] }, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === updated.id ? updated : item)),
          })),
        };
      });
      announce(`Asset ${updated.name} updated.`);
    },
    [client, announce],
  );

  // Bulk status update with optimistic UI, bounded concurrency, and 207 partial rollback
  const applyBulkStatus = useCallback(
    async (targetStatus: AssetStatus, explicitIds?: string[]) => {
      const idsToUpdate = explicitIds ?? [...selectedIds];
      if (idsToUpdate.length === 0) return;

      setIsBulkProcessing(true);

      // Snapshot previous asset states for rollback
      const previousAssetsMap = new Map<string, Asset>();
      for (const item of items) {
        if (idsToUpdate.includes(item.id)) {
          previousAssetsMap.set(item.id, item);
        }
      }

      // Optimistic update in query cache
      client.setQueriesData<InfiniteData<AssetPage>>({ queryKey: ['assets'] }, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              idsToUpdate.includes(item.id)
                ? { ...item, status: targetStatus, updatedAt: new Date().toISOString() }
                : item,
            ),
          })),
        };
      });

      announce(`Applying ${statusLabel(targetStatus)} to ${idsToUpdate.length} assets…`);

      // If currently offline, queue mutations locally and return early
      if (!isOnline) {
        enqueueMutation({
          type: 'bulk_status',
          assetIds: idsToUpdate,
          targetStatus,
        });
        setIsBulkProcessing(false);
        if (!explicitIds) setSelectedIds(new Set());
        addNotice({
          type: 'warning',
          title: 'Offline: Changes queued',
          description: `Applied ${statusLabel(targetStatus)} to ${idsToUpdate.length} asset${idsToUpdate.length > 1 ? 's' : ''} locally. Will automatically synchronize when connection returns.`,
        });
        announce(`Offline: ${idsToUpdate.length} assets queued for synchronization.`);
        return;
      }

      try {
        const result = await bulkSetStatusChunked(idsToUpdate, targetStatus);

        if (result.failed === 0) {
          // Complete success
          addNotice({
            type: 'success',
            title: `Successfully updated ${result.applied} assets`,
            description: `All selected assets are now marked as ${statusLabel(targetStatus)}.`,
          });
          announce(`Successfully updated ${result.applied} assets.`);
          if (!explicitIds) setSelectedIds(new Set());
        } else {
          // Partial success (207 Multi-Status)
          const failedItems = result.results.filter((r) => !r.ok);
          const failedIds = new Set(failedItems.map((r) => r.id));

          // Rollback ONLY the failed assets to their snapshot state
          client.setQueriesData<InfiniteData<AssetPage>>({ queryKey: ['assets'] }, (oldData) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => {
                  if (failedIds.has(item.id)) {
                    return previousAssetsMap.get(item.id) ?? item;
                  }
                  return item;
                }),
              })),
            };
          });

          const retryableItems = failedItems.filter((f) => f.code === 'conflict');
          const legalHoldItems = failedItems.filter((f) => f.code === 'legal_hold');

          const detailParts: string[] = [];
          if (legalHoldItems.length > 0) {
            detailParts.push(`${legalHoldItems.length} on legal hold (cannot be modified)`);
          }
          if (retryableItems.length > 0) {
            detailParts.push(`${retryableItems.length} had concurrent conflicts`);
          }

          addNotice({
            type: 'warning',
            title: `Partial update: ${result.applied} succeeded, ${result.failed} failed`,
            description: detailParts.join(' · '),
            action:
              retryableItems.length > 0
                ? {
                    label: `Retry ${retryableItems.length} conflicts`,
                    onClick: () => {
                      applyBulkStatus(
                        targetStatus,
                        retryableItems.map((r) => r.id),
                      );
                    },
                  }
                : undefined,
          });

          announce(
            `Partial update: ${result.applied} succeeded, ${result.failed} failed. ${detailParts.join(', ')}`,
            'assertive',
          );
        }
      } catch (err: unknown) {
        // Total failure rollback
        client.setQueriesData<InfiniteData<AssetPage>>({ queryKey: ['assets'] }, (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => previousAssetsMap.get(item.id) ?? item),
            })),
          };
        });

        addNotice({
          type: 'error',
          title: 'Bulk update failed',
          description: err instanceof Error ? err.message : 'An error occurred during bulk update.',
        });
        announce('Bulk update failed. Changes reverted.', 'assertive');
      } finally {
        setIsBulkProcessing(false);
      }
    },
    [selectedIds, items, client, announce, addNotice],
  );

  return (
    <div className="app">
      {!isOnline && (
        <div className="offline-banner" role="alert">
          <span className="offline-banner__icon" aria-hidden="true">⚡</span>
          <span>
            You are currently offline. Changes are saved locally and will synchronize automatically when connection is restored.
          </span>
        </div>
      )}

      <header className="topbar" role="banner">
        <div className="topbar__brand">
          <div className="topbar__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm2 2h4v4H6V8Zm6 0h6v2h-6V8Zm0 4h6v2h-6v-2Zm-6 4h12v2H6v-2Z" />
            </svg>
          </div>
          <h1>MediaVault</h1>
        </div>

        <LibraryStats />

        <div className="topbar__search-wrap">
          <svg className="search-icon" viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
          </svg>
          <input
            id="search-input"
            className="search-input"
            type="search"
            placeholder="Search by name or tag (e.g. hero, runner)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search assets by title or tag"
          />
          {q && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setQ('')}
              aria-label="Clear search input"
            >
              ×
            </button>
          )}
        </div>

        <div className="topbar__actions">
          {pendingQueueCount > 0 && (
            <div
              className="queue-badge"
              role="status"
              title={`${pendingQueueCount} offline mutation${pendingQueueCount > 1 ? 's' : ''} stored locally awaiting sync`}
            >
              <span className="queue-badge__dot" aria-hidden="true" />
              <span>{pendingQueueCount} pending sync</span>
            </div>
          )}

          <div
            className={`live-badge live-badge--${sseStatus}`}
            title={`Server-Sent Events: ${sseStatus === 'connected' ? 'Live stream active' : sseStatus === 'connecting' ? 'Connecting to live events…' : 'Offline / disconnected'}`}
            role="status"
          >
            <span className="live-badge__dot" aria-hidden="true" />
            <span className="live-badge__text">
              {sseStatus === 'connected' ? 'Live sync' : sseStatus === 'connecting' ? 'Connecting…' : 'Live paused'}
            </span>
          </div>

          <div className="topbar__sort-wrap">
            <label htmlFor="sort-select" className="sr-only">Sort assets</label>
            <select
              id="sort-select"
              className="select select--sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as NonNullable<AssetQuery['sort']>)}
            >
              {SORTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <section className="filters" aria-label="Filters bar">
        <div className="filters__group">
          <span className="filters__title">Status:</span>
          {STATUSES.map((s) => (
            <label key={s} className="filter-chip">
              <input
                type="checkbox"
                checked={status.includes(s)}
                onChange={(e) =>
                  setStatus((prev) =>
                    e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                  )
                }
              />
              <span>{statusLabel(s)}</span>
            </label>
          ))}
        </div>

        <div className="filters__divider" />

        <div className="filters__group">
          <span className="filters__title">Type:</span>
          {KINDS.map((k) => (
            <label key={k} className="filter-chip">
              <input
                type="checkbox"
                checked={kind.includes(k)}
                onChange={(e) =>
                  setKind((prev) =>
                    e.target.checked ? [...prev, k] : prev.filter((x) => x !== k),
                  )
                }
              />
              <span className="capitalize">{k}</span>
            </label>
          ))}
        </div>

        <div className="filters__meta">
          <span className="muted">
            {isLoading
              ? 'Loading…'
              : `${items.length.toLocaleString()} of ${total.toLocaleString()} assets`}
          </span>
          {isFiltered && (
            <button
              type="button"
              className="btn-link"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          )}
        </div>
      </section>

      <NotificationToast notices={notices} onDismiss={dismissNotice} />

      <BulkActionBar
        selectedCount={selectedIds.size}
        totalLoaded={items.length}
        isProcessing={isBulkProcessing}
        onApplyStatus={applyBulkStatus}
        onSelectAllLoaded={handleSelectAllLoaded}
        onClearSelection={handleClearSelection}
      />

      <main className="content" role="main">
        <AssetGrid
          assets={items}
          selectedIds={selectedIds}
          activeId={activeId}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          error={isError ? (error as Error) : null}
          onToggleSelect={handleToggleSelect}
          onOpen={handleOpenDetail}
          onFetchNextPage={fetchNextPage}
          onRetry={refetch}
          onResetFilters={resetFilters}
        />

        {activeId && (
          <AssetDetail
            id={activeId}
            onClose={handleCloseDetail}
            onSaved={handleAssetSaved}
          />
        )}
      </main>
    </div>
  );
}
