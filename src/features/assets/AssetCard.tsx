import React, { useState } from 'react';
import { thumbnailUrl } from '@/api/client';
import { formatBytes, formatDate, statusLabel } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

interface Props {
  asset: Asset;
  isSelected: boolean;
  isActive: boolean;
  isFocused: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
}

function StatusBadge({ status }: { status: AssetStatus }) {
  const icon =
    status === 'approved' ? (
      <svg className="status-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
      </svg>
    ) : status === 'in_review' ? (
      <svg className="status-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9-3.25a.75.75 0 0 0-1.5 0v3.5c0 .2.08.39.22.53l2.25 2.25a.75.75 0 0 0 1.06-1.06L9.25 8.19V4.75Z" />
      </svg>
    ) : status === 'archived' ? (
      <svg className="status-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V3Zm1 3v6.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6H3Zm3.5 2h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1Z" />
      </svg>
    ) : (
      <svg className="status-icon" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086ZM9.75 4.81l-6.9 6.9-.54 1.89 1.89-.54 6.9-6.9-1.35-1.35Z" />
      </svg>
    );

  return (
    <span className={`pill pill--${status}`} title={`Status: ${statusLabel(status)}`}>
      {icon}
      <span>{statusLabel(status)}</span>
    </span>
  );
}

export const AssetCard = React.memo(
  function AssetCard({
    asset,
    isSelected,
    isActive,
    isFocused,
    onToggleSelect,
    onOpen,
    onFocus,
  }: Props) {
    const [imgFailed, setImgFailed] = useState(!asset.hasThumbnail);

    const hasLegalHold = asset.tags.includes('legal-hold');

    return (
      <div
        role="row"
        tabIndex={isFocused ? 0 : -1}
        className={
          'card' +
          (isSelected ? ' card--selected' : '') +
          (isActive ? ' card--active' : '') +
          (isFocused ? ' card--focused' : '')
        }
        data-asset-id={asset.id}
        onClick={() => onOpen(asset.id)}
        onFocus={() => onFocus(asset.id)}
        aria-selected={isSelected}
      >
        <div className="card__thumb-wrap">
          {!imgFailed ? (
            <img
              className="card__thumb"
              src={thumbnailUrl(asset.id)}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="card__thumb-fallback" aria-label={`Placeholder for ${asset.kind}`}>
              <span className="card__fallback-kind">{asset.kind}</span>
              <span className="card__fallback-id">{asset.id}</span>
            </div>
          )}

          <div
            className="card__check-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              id={`check-${asset.id}`}
              className="card__check"
              checked={isSelected}
              onChange={(e) => {
                const nativeEvent = e.nativeEvent as MouseEvent;
                onToggleSelect(asset.id, nativeEvent.shiftKey);
              }}
              aria-label={`Select ${asset.name}`}
            />
          </div>

          {hasLegalHold && (
            <span className="card__hold-badge" title="Asset on Legal Hold">
              Hold
            </span>
          )}
        </div>

        <div className="card__body">
          <p className="card__name" title={asset.name}>
            {asset.name}
          </p>

          <p className="muted card__meta">
            <span>{asset.kind}</span> · <span>{formatBytes(asset.sizeBytes)}</span> ·{' '}
            <span>{formatDate(asset.updatedAt)}</span>
          </p>

          <div className="card__footer">
            <StatusBadge status={asset.status} />
            {asset.tags.length > 0 && (
              <span className="card__tags-count" title={asset.tags.join(', ')}>
                {asset.tags.length} {asset.tags.length === 1 ? 'tag' : 'tags'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    // Re-render only if these specific states change for this card!
    return (
      prev.asset === next.asset &&
      prev.isSelected === next.isSelected &&
      prev.isActive === next.isActive &&
      prev.isFocused === next.isFocused
    );
  },
);
