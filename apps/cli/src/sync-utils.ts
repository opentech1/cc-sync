
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Function to compute hash of file content
export function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Directories to exclude from sync
const EXCLUDED_DIRS = new Set([
  "debug",
  "file-history",
  "shell-snapshots",
  "local",
  "statsig",
  "projects",  // Exclude project transcripts (can be huge)
]);

// Directories to limit to recent files only
const LIMITED_DIRS = new Set(["todos", "session-env"]);
const MAX_RECENT_FILES = 10;

// Function to read local files from ~/.claude/
export function readLocalFiles(syncPath: string): Array<{
  filePath: string;
  content: string;
  contentHash: string;
  lastModified: number;
}> {
  const expandedPath = syncPath.replace("~", process.env.HOME || "");

  if (!fs.existsSync(expandedPath)) {
    console.log(`Sync path ${expandedPath} does not exist, creating it...`);
    fs.mkdirSync(expandedPath, { recursive: true });
    return [];
  }

  const results: Array<{
    filePath: string;
    content: string;
    contentHash: string;
    lastModified: number;
  }> = [];

  function shouldSyncFile(fileName: string, dirName?: string): boolean {
    // Always sync .md, .json, .jsonl files at root level
    if (!dirName) {
      return fileName.endsWith(".md") || fileName.endsWith(".json") || fileName.endsWith(".jsonl");
    }

    // Sync .md files in commands directory (slash commands)
    if (dirName === "commands" && fileName.endsWith(".md")) {
      return true;
    }

    // Only sync .json files in other subdirectories
    return fileName.endsWith(".json");
  }

  function getRecentFiles(dirPath: string, limit: number): string[] {
    const files = fs.readdirSync(dirPath)
      .map(file => ({
        name: file,
        path: path.join(dirPath, file),
        mtime: fs.statSync(path.join(dirPath, file)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime) // Sort by modification time (newest first)
      .slice(0, limit) // Take only the most recent
      .map(f => f.name);

    return files;
  }

  function traverseDir(currentPath: string, relativePath: string, currentDirName?: string) {
    // Skip excluded directories
    if (currentDirName && EXCLUDED_DIRS.has(currentDirName)) {
      return;
    }

    const files = fs.readdirSync(currentPath);

    // If this is a limited directory, only process recent files
    let filesToProcess = files;
    if (currentDirName && LIMITED_DIRS.has(currentDirName)) {
      filesToProcess = getRecentFiles(currentPath, MAX_RECENT_FILES);
    }

    for (const file of filesToProcess) {
      const fullPath = path.join(currentPath, file);
      const relPath = path.join(relativePath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        traverseDir(fullPath, relPath, file);
      } else {
        if (shouldSyncFile(file, currentDirName)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          results.push({
            filePath: relPath,
            content,
            contentHash: computeHash(content),
            lastModified: stat.mtimeMs,
          });
        }
      }
    }
  }

  traverseDir(expandedPath, "");
  return results;
}

// Function to write remote files to ~/.claude/
export function writeLocalFiles(
  syncPath: string, 
  files: Array<{
    filePath: string;
    content: string;
    lastModified: number;
  }>
) {
  const expandedPath = syncPath.replace("~", process.env.HOME || "");
  
  if (!fs.existsSync(expandedPath)) {
    fs.mkdirSync(expandedPath, { recursive: true });
  }

  for (const file of files) {
    const fullPath = path.join(expandedPath, file.filePath);
    const dirPath = path.dirname(fullPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(fullPath, file.content, "utf-8");
    
    // Update mtime to match remote
    const time = new Date(file.lastModified);
    fs.utimesSync(fullPath, time, time);
  }
}
