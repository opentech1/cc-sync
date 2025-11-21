#!/usr/bin/env bun
/**
 * CC-Sync Daemon
 * Background process that watches ~/.claude/ and syncs changes
 */

import fs from "fs";
import path from "path";
import os from "os";
import keytar from "keytar";
import { createWatcher, stopWatcher } from "./watcher";
import { SyncEngine } from "./sync-engine";
import { CONVEX_URL } from "./config";

const SERVICE_NAME = "cc-sync";
const ACCOUNT_NAME = "api_key";
const DEVICE_ID = os.hostname();

// Daemon state directory
const STATE_DIR = path.join(os.homedir(), ".cc-sync");
const LOG_FILE = path.join(STATE_DIR, "daemon.log");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");
const MAX_LOG_SIZE = 1024 * 1024; // 1MB max log size

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  // Write directly to log file (stdout redirect has buffering issues)
  try {
    // Rotate log if too large
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const backupFile = LOG_FILE + ".old";
        if (fs.existsSync(backupFile)) {
          fs.unlinkSync(backupFile);
        }
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (error) {
    // Fallback to stdout if file write fails
    process.stdout.write(logLine);
  }
}

async function main() {
  log("CC-Sync daemon starting...");

  // Write PID file
  fs.writeFileSync(PID_FILE, process.pid.toString());
  log(`PID: ${process.pid}`);

  // Load API key
  let apiKey: string | null = null;
  try {
    apiKey = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } catch (error) {
    log("Failed to load API key from keychain");
  }

  if (!apiKey) {
    log("ERROR: No API key configured. Run 'cc-sync login' first.");
    process.exit(1);
  }

  log(`Device ID: ${DEVICE_ID}`);
  log(`Convex URL: ${CONVEX_URL}`);

  // Create sync engine
  const syncEngine = new SyncEngine({
    apiKey,
    deviceId: DEVICE_ID,
    convexUrl: CONVEX_URL,
    onSyncStart: () => log("Sync started..."),
    onSyncComplete: (result) => {
      if (result.success) {
        log(`Sync complete: ${result.message}`);
      } else {
        log(`Sync failed: ${result.message}`);
      }
    },
    onConflict: (filePath, conflictId) => {
      log(`CONFLICT: ${filePath} (ID: ${conflictId})`);
    },
    onError: (error) => {
      log(`ERROR: ${error.message}`);
    },
    // Don't log engine messages - they're already logged via callbacks above
  });

  // Create file watcher
  const watcher = createWatcher({
    onChange: (filePath, eventType) => {
      log(`File ${eventType}: ${filePath}`);
      syncEngine.queueChange(filePath, eventType);
    },
    onError: (error) => {
      log(`Watcher error: ${error.message}`);
    },
    onReady: () => {
      log("Watcher ready - monitoring ~/.claude/");
    },
  });

  // Do an initial sync
  log("Performing initial sync...");
  await syncEngine.forceSync();

  // Start real-time subscription for cross-device sync
  syncEngine.startRealtimeSync();

  // Handle shutdown signals
  const shutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down...`);

    // Stop watcher
    await stopWatcher(watcher);
    log("Watcher stopped");

    // Stop sync engine
    syncEngine.destroy();
    log("Sync engine stopped");

    // Remove PID file
    try {
      fs.unlinkSync(PID_FILE);
    } catch (error) {
      // Ignore
    }

    log("Daemon stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGHUP", () => shutdown("SIGHUP"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    log(`Uncaught exception: ${error.message}`);
    log(error.stack || "");
  });

  process.on("unhandledRejection", (reason) => {
    log(`Unhandled rejection: ${reason}`);
  });

  log("Daemon running. Press Ctrl+C to stop.");
}

// Run daemon
main().catch((error) => {
  log(`Fatal error: ${error.message}`);
  process.exit(1);
});
