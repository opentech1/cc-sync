/**
 * Sync engine with debouncing, rate limit protection, and real-time subscriptions
 */

import { ConvexHttpClient, ConvexClient } from "convex/browser";
import { api } from "../../backend/convex/_generated/api";
import { readLocalFiles, writeLocalFiles } from "./sync-utils";
import os from "os";
import fs from "fs";
import path from "path";

const SYNC_PATH = "~/.claude/";
const DEBOUNCE_MS = 5000;      // Wait 5s after last change before syncing
const MIN_INTERVAL_MS = 30000; // Minimum 30s between syncs
// Real-time sync: Uses Convex subscriptions to get instant notifications
// when another device pushes changes

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: number;
  message: string;
}

export interface SyncEngineConfig {
  apiKey: string;
  deviceId: string;
  convexUrl: string;
  onSyncStart?: () => void;
  onSyncComplete?: (result: SyncResult) => void;
  onConflict?: (filePath: string, conflictId: string) => void;
  onError?: (error: Error) => void;
  onLog?: (message: string) => void;
}

export class SyncEngine {
  private httpClient: ConvexHttpClient;
  private realtimeClient: ConvexClient | null = null;
  private config: SyncEngineConfig;
  private lastSyncTime: number = 0;
  private pendingChanges: Set<string> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;
  private unsubscribe: (() => void) | null = null;
  private lastSeenFiles: Set<string> = new Set(); // Track file hashes we've seen

  constructor(config: SyncEngineConfig) {
    this.config = config;
    this.httpClient = new ConvexHttpClient(config.convexUrl);
  }

  /**
   * Start real-time subscription to listen for changes from other devices
   */
  startRealtimeSync() {
    if (this.realtimeClient) return;

    this.realtimeClient = new ConvexClient(this.config.convexUrl);

    // Subscribe to changes from other devices
    this.unsubscribe = this.realtimeClient.onUpdate(
      api.sync.subscribeToChanges,
      { apiKey: this.config.apiKey, deviceId: this.config.deviceId },
      (result) => {
        if (!result) return;

        // Check if there are new files we haven't seen
        const newFiles = result.files.filter(
          (f) => !this.lastSeenFiles.has(f.contentHash)
        );

        if (newFiles.length > 0 && !this.isSyncing) {
          this.log(`Remote changes detected from other device: ${newFiles.length} file(s)`);

          // Update seen files
          result.files.forEach((f) => this.lastSeenFiles.add(f.contentHash));

          // Trigger a pull
          this.pullRemoteChanges();
        }

        // Check for new conflicts
        if (result.conflicts.length > 0) {
          for (const conflict of result.conflicts) {
            this.config.onConflict?.(conflict.filePath, conflict.id);
          }
        }
      }
    );

    this.log("Real-time sync started - listening for changes from other devices");
  }

  /**
   * Stop real-time subscription
   */
  stopRealtimeSync() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.realtimeClient) {
      this.realtimeClient.close();
      this.realtimeClient = null;
    }
  }

  /**
   * Pull remote changes only (no push)
   */
  private async pullRemoteChanges() {
    if (this.isSyncing) return;

    try {
      const pullResult = await this.httpClient.query(api.sync.pullSync, {
        apiKey: this.config.apiKey,
        deviceId: this.config.deviceId,
        lastSyncTime: this.lastSyncTime || undefined,
      });

      if (pullResult.files.length > 0) {
        this.log(`Downloading ${pullResult.files.length} files from other device...`);
        writeLocalFiles(SYNC_PATH, pullResult.files);
        this.lastSyncTime = Date.now();
        this.config.onSyncComplete?.({
          success: true,
          uploaded: 0,
          downloaded: pullResult.files.length,
          conflicts: 0,
          errors: 0,
          message: `Downloaded ${pullResult.files.length} files`,
        });
      }
    } catch (error) {
      this.log(`Pull error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  }

  /**
   * Queue a file change for sync (debounced)
   */
  queueChange(filePath: string, eventType: "add" | "change" | "unlink") {
    this.pendingChanges.add(filePath);
    this.log(`File ${eventType}: ${filePath}`);

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.trySync();
    }, DEBOUNCE_MS);
  }

  /**
   * Attempt to sync (respects rate limits)
   */
  private async trySync() {
    const now = Date.now();
    const timeSinceLastSync = now - this.lastSyncTime;

    if (timeSinceLastSync < MIN_INTERVAL_MS) {
      const waitTime = MIN_INTERVAL_MS - timeSinceLastSync;
      this.log(`Rate limit: waiting ${Math.ceil(waitTime / 1000)}s`);

      // Schedule sync for later
      setTimeout(() => this.trySync(), waitTime + 100);
      return;
    }

    if (this.isSyncing) {
      this.log("Sync already in progress, queuing...");
      return;
    }

    await this.performSync();
  }

  /**
   * Force an immediate sync (for manual trigger)
   */
  async forceSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: 0,
        message: "Sync already in progress",
      };
    }
    return this.performSync();
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(): Promise<SyncResult> {
    this.isSyncing = true;
    this.config.onSyncStart?.();
    this.log("Starting sync...");

    try {
      // 1. Pull remote changes first
      this.log("Pulling remote changes...");
      const pullResult = await this.httpClient.query(api.sync.pullSync, {
        apiKey: this.config.apiKey,
        deviceId: this.config.deviceId,
        lastSyncTime: this.lastSyncTime || undefined,
      });

      let downloaded = 0;
      if (pullResult.files.length > 0) {
        this.log(`Downloading ${pullResult.files.length} files...`);
        writeLocalFiles(SYNC_PATH, pullResult.files);
        downloaded = pullResult.files.length;
      }

      // 2. Read and push local files
      const localFiles = readLocalFiles(SYNC_PATH);
      this.log(`Uploading ${localFiles.length} files...`);

      const pushResult = await this.httpClient.mutation(api.sync.pushSync, {
        apiKey: this.config.apiKey,
        deviceId: this.config.deviceId,
        files: localFiles,
      });

      const uploaded = pushResult.results.filter(r => r.status === "success").length;
      const conflicts = pushResult.results.filter(r => r.status === "conflict");
      const errors = pushResult.results.filter(r => r.status === "error").length;

      // Notify about conflicts
      for (const conflict of conflicts) {
        if (conflict.conflictId) {
          this.config.onConflict?.(conflict.filePath, conflict.conflictId);
        }
      }

      // Update state
      this.lastSyncTime = Date.now();
      this.pendingChanges.clear();

      const result: SyncResult = {
        success: true,
        uploaded,
        downloaded,
        conflicts: conflicts.length,
        errors,
        message: this.buildResultMessage(uploaded, downloaded, conflicts.length, errors),
      };

      this.log(result.message);
      this.config.onSyncComplete?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.log(`Sync error: ${errorMessage}`);

      const result: SyncResult = {
        success: false,
        uploaded: 0,
        downloaded: 0,
        conflicts: 0,
        errors: 1,
        message: errorMessage,
      };

      this.config.onError?.(error instanceof Error ? error : new Error(errorMessage));
      this.config.onSyncComplete?.(result);
      return result;

    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopRealtimeSync();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  private buildResultMessage(uploaded: number, downloaded: number, conflicts: number, errors: number): string {
    const parts: string[] = [];

    if (uploaded > 0 || downloaded > 0) {
      const changes: string[] = [];
      if (uploaded > 0) changes.push(`${uploaded} up`);
      if (downloaded > 0) changes.push(`${downloaded} down`);
      parts.push(`Synced: ${changes.join(", ")}`);
    } else {
      parts.push("Up to date");
    }

    if (conflicts > 0) parts.push(`${conflicts} conflicts`);
    if (errors > 0) parts.push(`${errors} errors`);

    return parts.join(" | ");
  }

  private log(message: string) {
    const timestamp = new Date().toISOString();
    this.config.onLog?.(`[${timestamp}] ${message}`);
  }
}
