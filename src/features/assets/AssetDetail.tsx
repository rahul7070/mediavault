import { useEffect, useState, useRef, useCallback } from 'react';
import { getAsset, thumbnailUrl, updateAsset, ApiError } from '@/api/client';
import { formatBytes, formatDate, formatDuration, statusLabel } from '@/lib/format';
import type { Asset, AssetStatus } from '@/lib/types';

const STATUSES: AssetStatus[] = ['draft', 'in_review', 'approved', 'archived'];

interface Props {
  id: string;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}

export function AssetDetail({ id, onClose, onSaved }: Props) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictAsset, setConflictAsset] = useState<Asset | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // Focus management on mount
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [id]);

  // Handle Escape key to close panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch asset details
  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setError(null);
    setConflictAsset(null);
    setImgFailed(false);

    const controller = new AbortController();

    getAsset(id, controller.signal)
      .then((data) => {
        if (!cancelled) {
          setAsset(data);
          setImgFailed(!data.hasThumbnail);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && !(err instanceof DOMException && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Failed to load asset details.');
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  const setStatus = useCallback(
    async (nextStatus: AssetStatus, forcedVersion?: number) => {
      if (!asset) return;
      setSaving(true);
      setError(null);
      setConflictAsset(null);

      const targetVersion = forcedVersion ?? asset.version;
      const previousAsset = asset;

      // Optimistic update
      const optimisticAsset: Asset = {
        ...asset,
        status: nextStatus,
        version: targetVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      setAsset(optimisticAsset);
      onSaved(optimisticAsset);

      try {
        const updated = await updateAsset(asset.id, targetVersion, { status: nextStatus });
        setAsset(updated);
        onSaved(updated);
      } catch (err: unknown) {
        // Rollback optimistic state
        setAsset(previousAsset);
        onSaved(previousAsset);

        if (err instanceof ApiError && err.status === 409) {
          // Version conflict: Fetch latest server version to allow user resolution
          try {
            const fresh = await getAsset(asset.id);
            setConflictAsset(fresh);
            setError(
              `Version conflict: Another user changed this asset to "${statusLabel(fresh.status)}" (v${fresh.version}) while you were editing.`,
            );
          } catch {
            setError('Version conflict: The asset was modified on the server. Please reload.');
          }
        } else if (err instanceof ApiError && err.status === 422) {
          setError(`Cannot update status: ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : 'Save failed.');
        }
      } finally {
        setSaving(false);
      }
    },
    [asset, onSaved],
  );

  const hasLegalHold = asset?.tags.includes('legal-hold') ?? false;

  return (
    <aside
      ref={panelRef}
      className="panel"
      role="dialog"
      aria-label="Asset detail panel"
      aria-modal="false"
    >
      <div className="panel__head">
        <h2>Asset detail</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="panel__close-btn"
          onClick={onClose}
          aria-label="Close detail panel (Esc)"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="panel__error" role="alert">
          <p>{error}</p>
          {conflictAsset && (
            <div className="panel__conflict-actions">
              <button
                type="button"
                className="btn btn--subtle"
                onClick={() => {
                  setAsset(conflictAsset);
                  onSaved(conflictAsset);
                  setConflictAsset(null);
                  setError(null);
                }}
              >
                Accept server version
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setStatus(asset?.status ?? 'in_review', conflictAsset.version);
                }}
              >
                Overwrite anyway
              </button>
            </div>
          )}
        </div>
      )}

      {!asset && !error && (
        <div className="panel__loading" role="status">
          <div className="spinner" aria-hidden="true" />
          <p className="muted">Loading asset facts…</p>
        </div>
      )}

      {asset && (
        <div className="panel__body">
          <div className="panel__thumb-wrap">
            {!imgFailed ? (
              <img
                className="panel__thumb"
                src={thumbnailUrl(asset.id)}
                alt=""
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="panel__thumb-fallback" aria-label={`Fallback image for ${asset.name}`}>
                <span>{asset.kind.toUpperCase()}</span>
                <span className="muted">{asset.id}</span>
              </div>
            )}
            {hasLegalHold && <span className="panel__hold-badge">Legal Hold</span>}
          </div>

          <h3 className="panel__title">{asset.name}</h3>

          <div className="panel__section">
            <h4 className="panel__section-title">Status</h4>
            <div className="row">
              {STATUSES.map((status) => {
                const isCurrent = status === asset.status;
                const isHoldBlocked = hasLegalHold && status === 'archived';

                return (
                  <button
                    key={status}
                    type="button"
                    className={`btn btn--pill ${isCurrent ? 'btn--current' : ''}`}
                    disabled={saving || isCurrent || isHoldBlocked}
                    onClick={() => setStatus(status)}
                    title={
                      isHoldBlocked
                        ? 'Assets on legal hold cannot be archived'
                        : `Set status to ${statusLabel(status)}`
                    }
                  >
                    {statusLabel(status)}
                  </button>
                );
              })}
            </div>
            {hasLegalHold && (
              <p className="panel__hint muted">
                * This asset is on legal hold and cannot be moved to archived.
              </p>
            )}
          </div>

          <div className="panel__section">
            <h4 className="panel__section-title">Specifications</h4>
            <dl className="facts">
              <dt>ID</dt>
              <dd><code>{asset.id}</code></dd>

              <dt>Kind</dt>
              <dd className="capitalize">{asset.kind}</dd>

              <dt>Size</dt>
              <dd>{formatBytes(asset.sizeBytes)}</dd>

              {asset.width && asset.height && (
                <>
                  <dt>Dimensions</dt>
                  <dd>
                    {asset.width.toLocaleString()} × {asset.height.toLocaleString()} px
                  </dd>
                </>
              )}

              {asset.durationSec && (
                <>
                  <dt>Duration</dt>
                  <dd>{formatDuration(asset.durationSec)}</dd>
                </>
              )}

              <dt>Owner</dt>
              <dd>{asset.owner.name}</dd>

              <dt>Updated</dt>
              <dd>{formatDate(asset.updatedAt)}</dd>

              <dt>Version</dt>
              <dd>v{asset.version}</dd>
            </dl>
          </div>

          {asset.tags.length > 0 && (
            <div className="panel__section">
              <h4 className="panel__section-title">Tags ({asset.tags.length})</h4>
              <ul className="tags" aria-label="Asset tags">
                {asset.tags.map((tag) => (
                  <li key={tag} className={tag === 'legal-hold' ? 'tag--hold' : ''}>
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
