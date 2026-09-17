import { useEffect, useState, useRef } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Asset, AssetPage } from '@/lib/types';

interface UseAssetEventsOptions {
  activeAssetId?: string | null;
  selectedIds?: Set<string>;
}

export type SseConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Connects to Server-Sent Events (/api/events) and reconciles updated assets in the React Query cache
 * in-place, without triggering full refetches, jumping the user's scroll position, or clobbering local edits.
 */
export function useAssetEvents({
  activeAssetId = null,
  selectedIds = new Set(),
}: UseAssetEventsOptions = {}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SseConnectionStatus>('connecting');

  const activeIdRef = useRef(activeAssetId);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    activeIdRef.current = activeAssetId;
    selectedIdsRef.current = selectedIds;
  }, [activeAssetId, selectedIds]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.EventSource) {
      setStatus('disconnected');
      return;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled || !navigator.onLine) {
        setStatus('disconnected');
        return;
      }

      setStatus('connecting');
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          if (!isCancelled) setStatus('connected');
        };

        eventSource.addEventListener('asset.updated', (event) => {
          if (isCancelled) return;
          try {
            const updatedAsset: Asset = JSON.parse(event.data);
            if (!updatedAsset || !updatedAsset.id) return;

            // Protection: Do not clobber if user has it open in detail panel or selected
            if (activeIdRef.current === updatedAsset.id) return;
            if (selectedIdsRef.current?.has(updatedAsset.id)) return;

            // Reconcile across all cached infinite asset queries in-place
            queryClient.setQueriesData<InfiniteData<AssetPage>>(
              { queryKey: ['assets'] },
              (oldData) => {
                if (!oldData) return oldData;
                let found = false;
                const pages = oldData.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) => {
                    if (item.id === updatedAsset.id) {
                      found = true;
                      // Only apply if server version is >= current local version
                      if (updatedAsset.version >= item.version) {
                        return { ...item, ...updatedAsset };
                      }
                    }
                    return item;
                  }),
                }));
                return found ? { ...oldData, pages } : oldData;
              },
            );

            // Reconcile single asset query if cached
            queryClient.setQueryData<Asset>(['asset', updatedAsset.id], (old) => {
              if (!old) return old;
              return updatedAsset.version >= old.version ? { ...old, ...updatedAsset } : old;
            });
          } catch {
            // Ignore malformed event payloads
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isCancelled) {
            setStatus('disconnected');
            // Reconnect after 5s backoff
            reconnectTimeout = setTimeout(connect, 5000);
          }
        };
      } catch {
        setStatus('disconnected');
        reconnectTimeout = setTimeout(connect, 8000);
      }
    }

    connect();

    const handleOnline = () => {
      if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
        connect();
      }
    };

    const handleOffline = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      setStatus('disconnected');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient]);

  return { status };
}
