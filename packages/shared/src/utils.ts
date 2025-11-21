import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of content
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Generate a unique device ID
 */
export function generateDeviceId(): string {
  return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Normalize file paths across platforms
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Get file size in bytes
 */
export function getFileSize(content: string): number {
  return new Blob([content]).size;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Check if a path should be synced (exclude certain files)
 */
export function shouldSyncFile(filePath: string): boolean {
  const excludePatterns = [
    /node_modules/,
    /\.git/,
    /\.DS_Store/,
    /\.env$/,
    /\.env\./,
    /credentials\.json$/,
  ];

  return !excludePatterns.some((pattern) => pattern.test(filePath));
}
