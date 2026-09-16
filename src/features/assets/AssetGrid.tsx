import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AssetCard } from "./AssetCard";
import type { Asset } from "@/lib/types";

interface Props {
  assets: Asset[];
  selectedIds: Set<string>;
  activeId: string | null;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  error: Error | null;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onFetchNextPage: () => void;
  onRetry: () => void;
  onResetFilters?: () => void;
}

const CARD_MIN_WIDTH = 220;
const GAP = 14;

export function AssetGrid({
  assets,
  selectedIds,
  activeId,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  error,
  onToggleSelect,
  onOpen,
  onFetchNextPage,
  onRetry,
  onResetFilters,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(3);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Responsive column calculation
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          const calculated = Math.max(
            1,
            Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP)),
          );
          setColumns(calculated);
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(assets.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280,
    overscan: 4,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Infinite scroll trigger when scrolling near the end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (lastItem.index >= rowCount - 2 && hasNextPage && !isFetchingNextPage) {
      onFetchNextPage();
    }
  }, [
    virtualItems,
    rowCount,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
  ]);

  // Keep focusedIndex in bounds
  useEffect(() => {
    if (assets.length > 0 && focusedIndex >= assets.length) {
      setFocusedIndex(assets.length - 1);
    }
  }, [assets.length, focusedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (assets.length === 0) return;

      let nextIndex = focusedIndex;

      switch (e.key) {
        case "ArrowRight":
          nextIndex = Math.min(assets.length - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          nextIndex = Math.max(0, focusedIndex - 1);
          break;
        case "ArrowDown":
          nextIndex = Math.min(assets.length - 1, focusedIndex + columns);
          break;
        case "ArrowUp":
          nextIndex = Math.max(0, focusedIndex - columns);
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = assets.length - 1;
          break;
        case " ": // Space toggles selection
          e.preventDefault();
          if (assets[focusedIndex]) {
            onToggleSelect(assets[focusedIndex].id, e.shiftKey);
          }
          return;
        case "Enter": // Enter opens detail
          e.preventDefault();
          if (assets[focusedIndex]) {
            onOpen(assets[focusedIndex].id);
          }
          return;
        default:
          return;
      }

      if (nextIndex !== focusedIndex) {
        e.preventDefault();
        setFocusedIndex(nextIndex);

        // If Shift is held with arrow navigation, extend selection
        const nextAsset = assets[nextIndex];
        if (e.shiftKey && nextAsset) {
          onToggleSelect(nextAsset.id, true);
        }

        // Ensure row is in virtual view
        const targetRow = Math.floor(nextIndex / columns);
        rowVirtualizer.scrollToIndex(targetRow, { align: "auto" });
      }
    },
    [assets, focusedIndex, columns, onToggleSelect, onOpen, rowVirtualizer],
  );

  const selectedSet = useMemo(() => selectedIds, [selectedIds]);

  // Loading skeleton on initial fetch
  if (isLoading && assets.length === 0) {
    return (
      <div className="grid-skeleton" aria-label="Loading assets" role="status">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="card-skeleton">
            <div className="card-skeleton__thumb shimmer" />
            <div
              className="card-skeleton__line shimmer"
              style={{ width: "80%" }}
            />
            <div
              className="card-skeleton__line shimmer"
              style={{ width: "50%" }}
            />
          </div>
        ))}
      </div>
    );
  }

  // Error state on initial fetch
  const isAbort =
    error &&
    (error.name === "AbortError" ||
      error.message?.toLowerCase().includes("abort"));
  if (error && !isAbort && assets.length === 0) {
    return (
      <div className="empty empty--error" role="alert">
        <div className="empty__icon" aria-hidden="true">
          ⚠️
        </div>
        <h3>Unable to load assets</h3>
        <p className="muted">
          {error.message ||
            "A network error occurred while reaching the server."}
        </p>
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  // Empty state when search returns zero rows
  if (assets.length === 0) {
    return (
      <div className="empty" role="status">
        <div className="empty__icon" aria-hidden="true">
          🔍
        </div>
        <h3>No assets found</h3>
        <p className="muted">
          Try adjusting your keywords, expanding filters, or resetting your
          search.
        </p>
        {onResetFilters && (
          <button
            type="button"
            className="btn btn--subtle"
            onClick={onResetFilters}
          >
            Clear all filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="grid-container"
      tabIndex={0}
      role="grid"
      aria-label="Media asset grid"
      aria-rowcount={assets.length}
      onKeyDown={handleKeyDown}
    >
      <div
        className="virtual-inner"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const startIndex = virtualRow.index * columns;
          const rowAssets = assets.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="virtual-row"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
                display: "grid",
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${GAP}px`,
              }}
            >
              {rowAssets.map((asset, colIdx) => {
                const assetIdx = startIndex + colIdx;
                const isSelected = selectedSet.has(asset.id);
                const isActive = activeId === asset.id;
                const isFocused = focusedIndex === assetIdx;

                return (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    isSelected={isSelected}
                    isActive={isActive}
                    isFocused={isFocused}
                    onToggleSelect={onToggleSelect}
                    onOpen={onOpen}
                    onFocus={() => setFocusedIndex(assetIdx)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="grid-loading-more" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>Loading more assets…</span>
        </div>
      )}
    </div>
  );
}
