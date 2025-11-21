/**
 * Daemon manager for starting/stopping the background sync daemon
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const STATE_DIR = path.join(os.homedir(), ".cc-sync");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");
const LOG_FILE = path.join(STATE_DIR, "daemon.log");

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

export interface DaemonStatus {
  running: boolean;
  pid?: number;
  uptime?: string;
}

/**
 * Check if daemon is running
 */
export function getDaemonStatus(): DaemonStatus {
  if (!fs.existsSync(PID_FILE)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);

    // Check if process is actually running
    try {
      process.kill(pid, 0); // Signal 0 just checks if process exists
      return { running: true, pid };
    } catch {
      // Process not running, clean up stale PID file
      fs.unlinkSync(PID_FILE);
      return { running: false };
    }
  } catch {
    return { running: false };
  }
}

/**
 * Start the daemon in background
 */
export async function startDaemon(): Promise<{ success: boolean; message: string; pid?: number }> {
  const status = getDaemonStatus();

  if (status.running) {
    return {
      success: false,
      message: `Daemon already running (PID: ${status.pid})`,
      pid: status.pid,
    };
  }

  // Find the daemon script path
  const daemonScript = path.join(__dirname, "daemon.ts");

  // Check if we're running from dist (built) or src (dev)
  const scriptToRun = fs.existsSync(daemonScript)
    ? daemonScript
    : path.join(__dirname, "..", "src", "daemon.ts");

  if (!fs.existsSync(scriptToRun)) {
    return {
      success: false,
      message: `Daemon script not found at ${scriptToRun}`,
    };
  }

  // Spawn daemon as detached process
  // Note: Daemon writes directly to log file, so we ignore stdout/stderr here
  const child = spawn("bun", ["run", scriptToRun], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env },
  });

  // Unref to allow parent to exit independently
  child.unref();

  // Wait a moment for the daemon to start and write its PID
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify daemon started
  const newStatus = getDaemonStatus();

  if (newStatus.running) {
    return {
      success: true,
      message: `Daemon started (PID: ${newStatus.pid})`,
      pid: newStatus.pid,
    };
  } else {
    return {
      success: false,
      message: "Daemon failed to start. Check logs with 'cc-sync logs'",
    };
  }
}

/**
 * Stop the daemon
 */
export function stopDaemon(): { success: boolean; message: string } {
  const status = getDaemonStatus();

  if (!status.running) {
    return {
      success: true,
      message: "Daemon is not running",
    };
  }

  try {
    // Send SIGTERM for graceful shutdown
    process.kill(status.pid!, "SIGTERM");

    // Wait for process to exit (up to 5 seconds)
    let attempts = 0;
    while (attempts < 50) {
      try {
        process.kill(status.pid!, 0);
        // Process still running, wait
        execSync("sleep 0.1");
        attempts++;
      } catch {
        // Process exited
        break;
      }
    }

    // Force kill if still running
    if (attempts >= 50) {
      try {
        process.kill(status.pid!, "SIGKILL");
      } catch {
        // Ignore
      }
    }

    // Clean up PID file
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }

    return {
      success: true,
      message: `Daemon stopped (was PID: ${status.pid})`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to stop daemon: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Restart the daemon
 */
export async function restartDaemon(): Promise<{ success: boolean; message: string }> {
  const stopResult = stopDaemon();
  if (!stopResult.success && !stopResult.message.includes("not running")) {
    return stopResult;
  }

  // Wait a moment before starting
  await new Promise(resolve => setTimeout(resolve, 500));

  const startResult = await startDaemon();
  return startResult;
}

/**
 * Get recent log entries
 */
export function getLogs(lines: number = 50): string[] {
  if (!fs.existsSync(LOG_FILE)) {
    return ["No logs available"];
  }

  try {
    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const allLines = content.split("\n").filter(Boolean);
    return allLines.slice(-lines);
  } catch {
    return ["Failed to read logs"];
  }
}

/**
 * Clear log file
 */
export function clearLogs(): boolean {
  try {
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "");
    }
    return true;
  } catch {
    return false;
  }
}
