import { statusLabel } from '@/lib/format';
import type { AssetStatus } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  selectedCount: number;
  totalLoaded: number;
  isProcessing: boolean;
  onApplyStatus: (status: AssetStatus) => void;
  onSelectAllLoaded: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  totalLoaded,
  isProcessing,
  onApplyStatus,
  onSelectAllLoaded,
  onClearSelection,
}: Props) {
  if (selectedCount === 0) return null;

  return (
    <aside className="bulk-bar" aria-label="Bulk actions bar" role="toolbar">
      <div className="bulk-bar__info">
        <span className="bulk-bar__badge">{selectedCount}</span>
        <span className="bulk-bar__text">
          {selectedCount === 1 ? 'asset selected' : 'assets selected'}
        </span>
        {selectedCount < totalLoaded && (
          <button
            type="button"
            className="bulk-bar__link-btn"
            onClick={onSelectAllLoaded}
            disabled={isProcessing}
          >
            Select all {totalLoaded.toLocaleString()} loaded
          </button>
        )}
      </div>

      <div className="bulk-bar__actions">
        <span className="bulk-bar__label">Apply status:</span>
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn--pill btn--status-${s}`}
            disabled={isProcessing}
            onClick={() => onApplyStatus(s)}
          >
            {statusLabel(s)}
          </button>
        ))}

        <button
          type="button"
          className="btn btn--subtle"
          disabled={isProcessing}
          onClick={onClearSelection}
        >
          Clear
        </button>
      </div>

      {isProcessing && (
        <div className="bulk-bar__spinner" aria-live="polite">
          Applying updates…
        </div>
      )}
    </aside>
  );
}
