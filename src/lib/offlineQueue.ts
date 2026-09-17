import type { Asset, AssetStatus } from './types';

export type AssetPatch = Partial<Pick<Asset, 'name' | 'status' | 'tags'>>;

export interface SinglePatchMutation {
  id: string;
  type: 'single_patch';
  assetId: string;
  version: number;
  patch: AssetPatch;
  timestamp: number;
}

export interface BulkStatusMutation {
  id: string;
  type: 'bulk_status';
  assetIds: string[];
  targetStatus: AssetStatus;
  timestamp: number;
}

export type QueuedMutation = SinglePatchMutation | BulkStatusMutation;

export type QueuedMutationInput =
  | {
      type: 'single_patch';
      assetId: string;
      version: number;
      patch: AssetPatch;
    }
  | {
      type: 'bulk_status';
      assetIds: string[];
      targetStatus: AssetStatus;
    };

const STORAGE_KEY = 'mediavault_offline_mutations_v1';

export function getOfflineQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedMutation[];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedMutation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('offline_queue_changed', { detail: queue.length }));
  } catch {
    // LocalStorage write error (e.g. quota exceeded)
  }
}

export function enqueueMutation(input: QueuedMutationInput): QueuedMutation {
  const full: QueuedMutation = {
    ...input,
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  } as QueuedMutation;

  const queue = getOfflineQueue();
  queue.push(full);
  saveOfflineQueue(queue);
  return full;
}

export function removeMutation(id: string): void {
  const queue = getOfflineQueue().filter((m) => m.id !== id);
  saveOfflineQueue(queue);
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('offline_queue_changed', { detail: 0 }));
  } catch {
    // Ignore
  }
}
