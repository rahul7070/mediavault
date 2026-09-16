import { useState, useEffect, useRef, useCallback } from 'react';
import type { AssetStatus, AssetKind, AssetQuery } from '@/lib/types';

export interface SearchFilters {
  q: string;
  debouncedQ: string;
  status: AssetStatus[];
  kind: AssetKind[];
  sort: NonNullable<AssetQuery['sort']>;
  setQ: (val: string) => void;
  setStatus: (status: AssetStatus[] | ((prev: AssetStatus[]) => AssetStatus[])) => void;
  setKind: (kind: AssetKind[] | ((prev: AssetKind[]) => AssetKind[])) => void;
  setSort: (sort: NonNullable<AssetQuery['sort']>) => void;
  resetFilters: () => void;
  isFiltered: boolean;
}

const DEFAULT_SORT: NonNullable<AssetQuery['sort']> = 'updatedAt:desc';

function parseUrlParams(): {
  q: string;
  status: AssetStatus[];
  kind: AssetKind[];
  sort: NonNullable<AssetQuery['sort']>;
} {
  if (typeof window === 'undefined') {
    return { q: '', status: [], kind: [], sort: DEFAULT_SORT };
  }

  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') ?? '';
  const statusStr = params.get('status');
  const status = statusStr
    ? (statusStr.split(',').filter(Boolean) as AssetStatus[])
    : [];
  const kindStr = params.get('kind');
  const kind = kindStr ? (kindStr.split(',').filter(Boolean) as AssetKind[]) : [];
  const sort = (params.get('sort') as NonNullable<AssetQuery['sort']>) || DEFAULT_SORT;

  return { q, status, kind, sort };
}

export function useSearchFilters(): SearchFilters {
  const initial = useRef(parseUrlParams());

  const [q, setQState] = useState(initial.current.q);
  const [debouncedQ, setDebouncedQ] = useState(initial.current.q);
  const [status, setStatusState] = useState<AssetStatus[]>(initial.current.status);
  const [kind, setKindState] = useState<AssetKind[]>(initial.current.kind);
  const [sort, setSortState] = useState<NonNullable<AssetQuery['sort']>>(initial.current.sort);

  // Debounce search query input (250ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQ(q);
    }, 250);

    return () => clearTimeout(handler);
  }, [q]);

  // Sync to URL
  const updateUrl = useCallback(
    (
      newQ: string,
      newStatus: AssetStatus[],
      newKind: AssetKind[],
      newSort: NonNullable<AssetQuery['sort']>,
      replace = false,
    ) => {
      const params = new URLSearchParams();
      if (newQ.trim()) params.set('q', newQ.trim());
      if (newStatus.length) params.set('status', newStatus.join(','));
      if (newKind.length) params.set('kind', newKind.join(','));
      if (newSort && newSort !== DEFAULT_SORT) params.set('sort', newSort);

      const queryString = params.toString();
      const newUrl = queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname;

      if (replace) {
        window.history.replaceState(null, '', newUrl);
      } else {
        window.history.pushState(null, '', newUrl);
      }
    },
    [],
  );

  // When debouncedQ changes, replace state in URL (so typing doesn't create 10 history entries)
  useEffect(() => {
    updateUrl(debouncedQ, status, kind, sort, true);
  }, [debouncedQ, status, kind, sort, updateUrl]);

  // Handle browser Back / Forward
  useEffect(() => {
    function handlePopState() {
      const parsed = parseUrlParams();
      setQState(parsed.q);
      setDebouncedQ(parsed.q);
      setStatusState(parsed.status);
      setKindState(parsed.kind);
      setSortState(parsed.sort);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setQ = (val: string) => {
    setQState(val);
  };

  const setStatus = (action: AssetStatus[] | ((prev: AssetStatus[]) => AssetStatus[])) => {
    setStatusState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      updateUrl(q, next, kind, sort, false);
      return next;
    });
  };

  const setKind = (action: AssetKind[] | ((prev: AssetKind[]) => AssetKind[])) => {
    setKindState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      updateUrl(q, status, next, sort, false);
      return next;
    });
  };

  const setSort = (newSort: NonNullable<AssetQuery['sort']>) => {
    setSortState(newSort);
    updateUrl(q, status, kind, newSort, false);
  };

  const resetFilters = () => {
    setQState('');
    setDebouncedQ('');
    setStatusState([]);
    setKindState([]);
    setSortState(DEFAULT_SORT);
    updateUrl('', [], [], DEFAULT_SORT, false);
  };

  const isFiltered = Boolean(q.trim() || status.length > 0 || kind.length > 0 || sort !== DEFAULT_SORT);

  return {
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
  };
}
