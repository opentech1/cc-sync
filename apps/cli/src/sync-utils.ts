
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
]);

// Directories to limit to recent files only
const LIMITED_DIRS = new Set(["todos", "session-env"]);
const MAX_RECENT_FILES = 10;

// Special handling for projects directory - sync recent sessions across all projects
const MAX_RECENT_SESSIONS = 10;

// Function to get the N most recent session files across all projects
function getRecentSessions(projectsPath: string, limit: number): Array<{
  fullPath: string;
  relPath: string;
  mtime: number;
}> {
  if (!fs.existsSync(projectsPath)) return [];

  const allSessions: Array<{ fullPath: string; relPath: string; mtime: number }> = [];

  // Iterate through all project directories
  const projectDirs = fs.readdirSync(projectsPath);
  for (const projectDir of projectDirs) {
    const projectPath = path.join(projectsPath, projectDir);
    const stat = fs.statSync(projectPath);

    if (!stat.isDirectory()) continue;

    // Find session files (UUID.jsonl, not agent-*.jsonl)
    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      // Only sync main session files (UUID format), skip agent files
      if (file.endsWith(".jsonl") && !file.startsWith("agent-")) {
        const fullPath = path.join(projectPath, file);
        const fileStat = fs.statSync(fullPath);
        allSessions.push({
          fullPath,
          relPath: path.join("projects", projectDir, file),
          mtime: fileStat.mtimeMs,
        });
      }
    }
  }

  // Sort by modification time and return the most recent
  return allSessions
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

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

    // Special handling for projects directory - sync recent sessions across all projects
    if (currentDirName === "projects") {
      const recentSessions = getRecentSessions(currentPath, MAX_RECENT_SESSIONS);
      for (const session of recentSessions) {
        try {
          const content = fs.readFileSync(session.fullPath, "utf-8");
          results.push({
            filePath: session.relPath,
            content,
            contentHash: computeHash(content),
            lastModified: session.mtime,
          });
        } catch (error) {
          // Skip files that can't be read
        }
      }
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
