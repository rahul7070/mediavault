export type AssetStatus = 'draft' | 'in_review' | 'approved' | 'archived';
export type AssetKind = 'image' | 'video' | 'document';

export interface Owner {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  status: AssetStatus;
  tags: string[];
  collectionId: string;
  owner: Owner;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  hasThumbnail: boolean;
}

export interface AssetPage {
  items: Asset[];
  total: number;
  nextCursor: string | null;
}

export interface AssetQuery {
  q?: string;
  status?: AssetStatus[];
  kind?: AssetKind[];
  tag?: string[];
  collectionId?: string;
  owner?: string;
  sort?: 'updatedAt:desc' | 'updatedAt:asc' | 'name:asc' | 'name:desc' | 'sizeBytes:desc' | 'createdAt:desc';
  limit?: number;
  cursor?: string;
}

export type BulkItemResult =
  | { id: string; ok: true; asset: Asset }
  | { id: string; ok: false; code: string; message?: string };

export interface BulkResult {
  results: BulkItemResult[];
  applied: number;
  failed: number;
}

export interface Facets {
  tags: string[];
  owners: Owner[];
  statuses: AssetStatus[];
  kinds: AssetKind[];
}

export interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  totalBytes: number;
}

export interface CollectionItem {
  id: string;
  name: string;
}
