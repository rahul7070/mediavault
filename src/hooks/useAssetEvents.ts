import { useEffect } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Asset, AssetPage } from '@/lib/types';

/**
 * Connects to Server-Sent Events (/api/events) and reconciles updated assets in the React Query cache
 * in-place, without triggering full refetches or jumping the user's scroll position.
 */
export function useAssetEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.addEventListener('asset.updated', (event) => {
          try {
            const updatedAsset: Asset = JSON.parse(event.data);

            // Reconcile across all cached infinite asset queries
            queryClient.setQueriesData<InfiniteData<AssetPage>>(
              { queryKey: ['assets'] },
              (oldData) => {
                if (!oldData) return oldData;
                return {
                  ...oldData,
                  pages: oldData.pages.map((page) => ({
                    ...page,
                    items: page.items.map((item) =>
                      item.id === updatedAsset.id ? { ...item, ...updatedAsset } : item,
                    ),
                  })),
                };
              },
            );

            // Reconcile single asset query if cached
            queryClient.setQueryData<Asset>(['asset', updatedAsset.id], (old) =>
              old ? { ...old, ...updatedAsset } : old,
            );
          } catch {
            // Ignore malformed event payloads
          }
        });

        eventSource.onerror = () => {
          eventSource?.close();
          // Attempt reconnect after 5s
          reconnectTimeout = setTimeout(connect, 5000);
        };
      } catch {
        // EventSource unsupported or blocked
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      eventSource?.close();
    };
  }, [queryClient]);
}
