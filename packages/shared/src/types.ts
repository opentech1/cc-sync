// Shared types for cc-sync

export interface SyncedFile {
  id: string;
  userId: string;
  deviceId: string;
  filePath: string;
  content: string;
  contentHash: string;
  lastModified: number;
  version: number;
  syncedAt: number;
}

export interface SyncConflict {
  id: string;
  userId: string;
  filePath: string;
  deviceAId: string;
  deviceBId: string;
  contentA: string;
  contentB: string;
  resolvedAt?: number;
  resolution?: "keep_local" | "keep_remote" | "keep_both" | "manual";
}

export interface User {
  id: string;
  email: string;
  googleId?: string;
  apiKeyHash?: string;
  storageUsed: number;
  storageLimit: number;
  tier: "free" | "pro";
  lastSyncAt: number;
}

export interface SyncStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: number;
  pendingFiles: number;
  conflicts: number;
}

export interface RateLimit {
  allowed: boolean;
  remaining: number;
  resetAt?: number;
}
