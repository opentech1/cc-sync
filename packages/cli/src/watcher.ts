/**
 * File watcher for ~/.claude/ directory
 * Uses chokidar for cross-platform file watching
 */

import chokidar from "chokidar";
import path from "path";
import os from "os";

// Directories to exclude from watching (same as sync-utils.ts)
const EXCLUDED_DIRS = [
  "debug",
  "file-history",
  "shell-snapshots",
  "local",
  "statsig",
  "projects",
  "node_modules",
];

// File patterns to watch
const WATCH_PATTERNS = [
  "**/*.md",
  "**/*.json",
  "**/*.jsonl",
];

export interface WatcherEvents {
  onChange: (filePath: string, eventType: "add" | "change" | "unlink") => void;
  onError: (error: Error) => void;
  onReady: () => void;
}

export function createWatcher(events: WatcherEvents): chokidar.FSWatcher {
  const claudeDir = path.join(os.homedir(), ".claude");

  // Build ignore patterns
  const ignored = [
    ...EXCLUDED_DIRS.map(dir => path.join(claudeDir, dir, "**")),
    /node_modules/,
    /\.git/,
    /\.DS_Store/,
  ];

  const watcher = chokidar.watch(claudeDir, {
    ignored,
    persistent: true,
    ignoreInitial: true, // Don't fire events for existing files on startup
    awaitWriteFinish: {
      stabilityThreshold: 500, // Wait 500ms after last write
      pollInterval: 100,
    },
    depth: 3, // Don't go too deep
  });

  watcher
    .on("add", (filePath) => {
      if (shouldSync(filePath)) {
        events.onChange(getRelativePath(filePath, claudeDir), "add");
      }
    })
    .on("change", (filePath) => {
      if (shouldSync(filePath)) {
        events.onChange(getRelativePath(filePath, claudeDir), "change");
      }
    })
    .on("unlink", (filePath) => {
      if (shouldSync(filePath)) {
        events.onChange(getRelativePath(filePath, claudeDir), "unlink");
      }
    })
    .on("error", events.onError)
    .on("ready", events.onReady);

  return watcher;
}

function shouldSync(filePath: string): boolean {
  const ext = path.extname(filePath);
  if (ext !== ".md" && ext !== ".json" && ext !== ".jsonl") {
    return false;
  }

  // Double-check excluded directories (belt and suspenders)
  const normalizedPath = filePath.replace(/\\/g, "/");
  for (const excluded of EXCLUDED_DIRS) {
    if (normalizedPath.includes(`/${excluded}/`) || normalizedPath.includes(`${path.sep}${excluded}${path.sep}`)) {
      return false;
    }
  }

  return true;
}

function getRelativePath(filePath: string, baseDir: string): string {
  return path.relative(baseDir, filePath);
}

export function stopWatcher(watcher: chokidar.FSWatcher): Promise<void> {
  return watcher.close();
}
