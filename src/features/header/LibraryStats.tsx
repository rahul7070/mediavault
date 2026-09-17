import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStats } from '../../api/client';
import { formatBytes } from '../../lib/format';

export const LibraryStats: React.FC = () => {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['library-stats'],
    queryFn: ({ signal }) => getStats(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !stats) {
    return (
      <div className="header-stats-skeleton" aria-hidden="true">
        <span className="stats-skeleton-pill"></span>
      </div>
    );
  }

  return (
    <div
      className="header-stats"
      role="region"
      aria-label="Library Overview Statistics"
      title={`Library: ${stats.total.toLocaleString()} total assets (${formatBytes(stats.totalBytes)})`}
    >
      <span className="stats-badge stats-total">
        <strong>{stats.total.toLocaleString()}</strong> assets
      </span>
      <span className="stats-separator" aria-hidden="true">•</span>
      <span className="stats-badge stats-size">
        {formatBytes(stats.totalBytes)}
      </span>
      <span className="stats-separator" aria-hidden="true">•</span>
      <span className="stats-badge stats-approved">
        {(stats.byStatus.approved ?? 0).toLocaleString()} approved
      </span>
    </div>
  );
};
