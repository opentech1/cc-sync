import { render, Box, Text, useInput, useApp } from "ink";
import React, { useState, useEffect } from "react";
import { ConvexReactClient } from "convex/react";
import { useQuery, useMutation } from "convex/react";
import { ConvexProvider } from "convex/react";
import { exec } from "child_process";
import TextInput from "ink-text-input";
import keytar from "keytar";
import { api } from "../../backend/convex/_generated/api";
import { readLocalFiles, writeLocalFiles } from "./sync-utils";
import { getDaemonStatus, startDaemon, stopDaemon, restartDaemon, getLogs, clearLogs } from "./daemon-manager";
import { CONVEX_URL, AUTH_WEB_URL } from "./config";
import os from "os";
const convex = new ConvexReactClient(CONVEX_URL);
const SERVICE_NAME = "cc-sync";
const ACCOUNT_NAME = "api_key";
const DEVICE_ID = os.hostname(); // Simple device ID for now

// CLI Arguments handling
const args = process.argv.slice(2);
const command = args[0];
const flags = args.slice(1);

function App() {
  const [view, setView] = useState<"home" | "sync" | "settings" | "login">("home");
  const [convexStatus, setConvexStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [apiKey, setApiKey] = useState("");
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<number>(0);
  const { exit } = useApp();

  // Handle initial command
  useEffect(() => {
    if (command === "login" || (command === "auth" && args[1] === "login")) {
        const provider = flags.includes("--github") ? "github" : flags.includes("--google") ? "google" : null;
        const url = provider ? `${AUTH_WEB_URL}/auth/${provider}` : AUTH_WEB_URL;

        exec(`open "${url}"`);
        setView("login");
    } else if (command === "sync") {
        setView("sync");
        // We need to wait for key load then sync
    }
  }, []);

  // Load saved API key
  useEffect(() => {
    const loadKey = async () => {
      try {
        const key = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
        if (key) {
          setSavedApiKey(key);
          setApiKey(key);
        } else if (command === "sync") {
            console.error("Error: Not logged in. Run 'cc-sync login' first.");
            exit();
        }
      } catch (error) {
        // Ignore error
      }
    };
    loadKey();
  }, []);

  // Auto-sync when entering sync view with 'sync' command
  // Disabled to prevent rate limit errors on launch
  // useEffect(() => {
  //   if (command === "sync" && view === "sync" && savedApiKey && syncStatus === "idle") {
  //     performSync();
  //   }
  // }, [view, savedApiKey, command]);


  // Test Convex connection
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const testConnection = async () => {
      try {
        // Test connection by making a simple HTTP request to the Convex URL
        const response = await fetch(CONVEX_URL);
        if (response.ok || response.status === 200) {
          setConvexStatus("connected");
        } else {
          setConvexStatus("disconnected");
        }
      } catch (error) {
        setConvexStatus("disconnected");
      }
    };

    // Test immediately
    testConnection();

    // Retest every 5 seconds
    const intervalId = setInterval(testConnection, 5000);

    return () => {
      clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const performSync = async () => {
    if (!savedApiKey) return;

    // Client-side cooldown: prevent syncing more than once every 2 seconds
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncAttempt;
    const cooldownMs = 2000; // 2 seconds

    if (timeSinceLastSync < cooldownMs) {
      const waitTime = Math.ceil((cooldownMs - timeSinceLastSync) / 1000);
      setSyncStatus("error");
      setSyncMessage(`⏸️  Please wait ${waitTime}s before syncing again`);
      return;
    }

    setLastSyncAttempt(now);
    setSyncStatus("syncing");
    setSyncMessage("Reading local files...");

    try {
      const syncStartTime = Date.now();

      // 1. Pull remote changes FIRST (before reading local files)
      setSyncMessage("Checking for remote changes...");
      const pullResult = await convex.query(api.sync.pullSync, {
        apiKey: savedApiKey,
        deviceId: DEVICE_ID,
        lastSyncTime: lastSyncTime || undefined
      });

      let downloadedCount = 0;
      if (pullResult.files.length > 0) {
         setSyncMessage(`Downloading ${pullResult.files.length} files...`);
         writeLocalFiles("~/.claude/", pullResult.files);
         downloadedCount = pullResult.files.length;
      }

      // 2. Read local files (after downloading remote changes)
      const localFiles = readLocalFiles("~/.claude/");

      setSyncMessage(`Uploading ${localFiles.length} files...`);

      // 3. Push to Convex
      const pushResult = await convex.mutation(api.sync.pushSync, {
        apiKey: savedApiKey,
        deviceId: DEVICE_ID,
        files: localFiles
      });

      const uploadedCount = pushResult.results.filter(r => r.status === "success").length;
      const conflictsCount = pushResult.results.filter(r => r.status === "conflict").length;
      const errorsCount = pushResult.results.filter(r => r.status === "error").length;

      setSyncStatus("success");

      // Build a detailed message
      const parts: string[] = [];
      if (uploadedCount > 0 || downloadedCount > 0) {
        const changes: string[] = [];
        if (uploadedCount > 0) changes.push(`${uploadedCount} up`);
        if (downloadedCount > 0) changes.push(`${downloadedCount} down`);
        parts.push(`✓ Synced: ${changes.join(', ')}`);
      } else {
        parts.push("✓ Everything up to date");
      }

      if (conflictsCount > 0) parts.push(`${conflictsCount} conflicts`);
      if (errorsCount > 0) parts.push(`${errorsCount} errors`);

      setSyncMessage(parts.join(' • '));
      setLastSyncTime(syncStartTime);

    } catch (error) {
      setSyncStatus("error");

      // Handle rate limit errors gracefully
      if (error instanceof Error && error.message.includes("Rate limit exceeded")) {
        const match = error.message.match(/Try again in (\d+)s/);
        const seconds = match ? match[1] : "a few";
        setSyncMessage(`⏳ Rate limit reached. Please wait ${seconds} seconds before syncing again.`);
      } else {
        setSyncMessage(error instanceof Error ? error.message : "Sync failed");
      }
    }
  };

  useInput((input, key) => {
    if (view === "home") {
      if (input === "1") {
        const url = AUTH_WEB_URL;
        exec(`open "${url}"`);
        setApiKey(""); // Clear the input field for new API key
        setView("login");
      } else if (input === "2") {
        setView("sync");
      } else if (input === "3") {
        setView("settings");
      } else if (input === "s") {
        if (savedApiKey) {
          setSyncStatus("idle");
          setSyncMessage("");
          performSync();
        }
      } else if (input === "c") {
        // Clear sync status
        setSyncStatus("idle");
        setSyncMessage("");
      } else if (input === "q" || key.escape) {
        exit();
      }
    } else if (view === "sync") {
      if (input === "b") {
        if (command === "sync") exit();
        else setView("home");
      } else if (input === "s") {
        if (savedApiKey) performSync();
      } else if (input === "q") {
        exit();
      }
    } else if (view === "settings") {
      if (input === "b") {
        setView("home");
      } else if (input === "x") {
        // Clear all synced files
        if (savedApiKey) {
          setSyncStatus("syncing");
          setSyncMessage("Clearing all synced files...");
          convex.mutation(api.sync.clearAllFiles, { apiKey: savedApiKey })
            .then((result) => {
              setSyncStatus("success");
              setSyncMessage(`✓ Cleared ${result.deletedCount} files from database`);
            })
            .catch((error) => {
              setSyncStatus("error");
              setSyncMessage(error instanceof Error ? error.message : "Failed to clear files");
            });
        }
      }
    } else if (view === "login") {
      if (key.escape) {
        setView("home");
      }
    }
  });

  if (view === "login") {
    return (
      <Box flexDirection="column" width={60} paddingX={2} paddingY={1}>
        <Text bold color="cyan">🔑 Login / API Key</Text>
        <Text dimColor>{"─".repeat(58)}</Text>

        <Box marginTop={1} flexDirection="column">
          <Text>We've opened <Text color="cyan">{AUTH_WEB_URL}</Text> in your browser.</Text>
          <Text>Please log in and paste your API key below:</Text>
        </Box>

        <Box marginTop={2} borderStyle="round" borderColor={apiKey ? "green" : "gray"}>
          <Box marginRight={1}>
             <Text>API Key:</Text>
          </Box>
          <TextInput
            value={apiKey}
            onChange={setApiKey}
            onSubmit={async (value) => {
              if (value.trim()) {
                await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, value.trim());
                setSavedApiKey(value.trim());
                setView("home");
              }
            }}
            placeholder="Paste your key starting with ccsk_..."
          />
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text bold>Enter</Text>
          <Text dimColor> to save or </Text>
          <Text bold>Esc</Text>
          <Text dimColor> to cancel</Text>
        </Box>
      </Box>
    );
  }


  if (view === "sync") {
    return (
      <Box flexDirection="column" width={60} paddingX={2} paddingY={1}>
        <Text bold color="cyan">📊 Sync Status</Text>
        <Text dimColor>{"─".repeat(58)}</Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={18}><Text dimColor>Last Sync:</Text></Box>
            <Text>{lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : "Never"}</Text>
          </Box>
          <Box>
            <Box width={18}><Text dimColor>Status:</Text></Box>
            <Text color={syncStatus === "success" ? "green" : syncStatus === "error" ? "red" : syncStatus === "syncing" ? "yellow" : "white"}>
              {syncStatus === "idle" ? "Ready" : syncStatus === "syncing" ? "Syncing..." : syncStatus === "success" ? "Success" : "Error"}
            </Text>
          </Box>
          {syncMessage && (
            <Box>
              <Box width={18}><Text dimColor>Message:</Text></Box>
              <Text>{syncMessage}</Text>
            </Box>
          )}
        </Box>

        {!savedApiKey && (
            <Box marginTop={1}>
              <Text color="yellow">⚠️  Configure API key to start syncing</Text>
            </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text bold>s</Text>
          <Text dimColor> to sync now</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text bold>b</Text>
          <Text dimColor> to go back</Text>
          {command === "sync" && <Text dimColor> or <Text bold>q</Text> to exit</Text>}
        </Box>
      </Box>
    );
  }

  if (view === "settings") {
    return (
      <Box flexDirection="column" width={60} paddingX={2} paddingY={1}>
        <Text bold color="cyan">⚙️  Settings</Text>
        <Text dimColor>{"─".repeat(58)}</Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={18}><Text dimColor>API Key:</Text></Box>
            <Text color={savedApiKey ? "green" : "red"}>
              {savedApiKey ? `${savedApiKey.substring(0, 10)}...` : "Not configured"}
            </Text>
          </Box>
          <Box>
            <Box width={18}><Text dimColor>Auto-sync:</Text></Box>
            <Text>Disabled</Text>
          </Box>
          <Box>
            <Box width={18}><Text dimColor>Sync Path:</Text></Box>
            <Text>~/.claude/</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Visit </Text>
          <Text color="cyan">{AUTH_WEB_URL}</Text>
          <Text dimColor> to get your API key</Text>
        </Box>

        {syncStatus === "syncing" && (
          <Box marginTop={1} borderStyle="round" borderColor="yellow">
            <Text color="yellow">⏳ {syncMessage}</Text>
          </Box>
        )}
        {syncStatus === "success" && (
          <Box marginTop={1} borderStyle="round" borderColor="green">
            <Text color="green">{syncMessage}</Text>
          </Box>
        )}
        {syncStatus === "error" && (
          <Box marginTop={1} borderStyle="round" borderColor="red">
            <Text color="red">✗ {syncMessage}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text bold color="red">x</Text>
          <Text dimColor> to clear all synced files (for testing)</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Text bold>b</Text>
          <Text dimColor> to go back</Text>
        </Box>
      </Box>
    );
  }

  const convexStatusColor = convexStatus === "connected" ? "green" : convexStatus === "checking" ? "yellow" : "red";
  const convexStatusText = convexStatus === "connected" ? "✓ Connected" : convexStatus === "checking" ? "○ Connecting..." : "✗ Disconnected";

  return (
    <Box flexDirection="column" width={60} paddingX={2} paddingY={1}>
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="magenta">CC-SYNC</Text>
      </Box>
      <Box justifyContent="center" marginBottom={1}>
        <Text dimColor>Claude Code Sync</Text>
      </Box>

      <Box borderStyle="round" borderColor="cyan" padding={1}>
        <Box flexDirection="column">
          <Text bold>Services</Text>
          <Text color="green">  ✓ Auth Web: {AUTH_WEB_URL}</Text>
          <Text color={convexStatusColor}>  {convexStatusText}</Text>
          <Text dimColor>
            {savedApiKey ? "  ✓ Sync: Configured" : "  ○ Sync: Not configured"}
          </Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Quick Actions</Text>
        <Text>  <Text color="cyan" bold>1</Text> - {savedApiKey ? "Relogin / Change Key" : "Login / Get API Key"}</Text>
        <Text>  <Text color="cyan" bold>2</Text> - View Sync Status</Text>
        <Text>  <Text color="cyan" bold>3</Text> - Settings</Text>
        {savedApiKey && <Text>  <Text color="green" bold>s</Text> - Quick Sync</Text>}
        <Text>  <Text color="red" bold>q</Text> - Exit</Text>
      </Box>

      {syncStatus === "syncing" && (
        <Box marginTop={1} borderStyle="round" borderColor="yellow">
          <Text color="yellow">⏳ {syncMessage}</Text>
        </Box>
      )}
      {syncStatus === "success" && (
        <Box marginTop={1} borderStyle="round" borderColor="green">
          <Text color="green">{syncMessage}</Text>
        </Box>
      )}
      {syncStatus === "error" && (
        <Box marginTop={1} borderStyle="round" borderColor="red">
          <Text color="red">✗ {syncMessage}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        {syncStatus && syncStatus !== "idle" ? (
          <Text dimColor>Press <Text bold>c</Text> to clear or <Text bold>q</Text> to exit</Text>
        ) : (
          <Text dimColor>Press a key to navigate...</Text>
        )}
      </Box>
    </Box>
  );
}

// Handle daemon commands first (non-interactive)
async function handleDaemonCommands(): Promise<boolean> {
  switch (command) {
    case "start": {
      console.log("Starting cc-sync daemon...");
      const result = await startDaemon();
      console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      if (result.success) {
        console.log("Tip: Use 'cc-sync logs' to view sync activity");
      }
      process.exit(result.success ? 0 : 1);
      return true;
    }

    case "stop": {
      console.log("Stopping cc-sync daemon...");
      const result = stopDaemon();
      console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      process.exit(result.success ? 0 : 1);
      return true;
    }

    case "restart": {
      console.log("Restarting cc-sync daemon...");
      const result = await restartDaemon();
      console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      process.exit(result.success ? 0 : 1);
      return true;
    }

    case "status": {
      const status = getDaemonStatus();
      if (status.running) {
        console.log(`✓ Daemon is running (PID: ${status.pid})`);
      } else {
        console.log("○ Daemon is not running");
        console.log("  Run 'cc-sync start' to start the daemon");
      }
      process.exit(0);
      return true;
    }

    case "logs": {
      const lines = flags.includes("-n")
        ? parseInt(flags[flags.indexOf("-n") + 1] || "50", 10)
        : 50;
      const logLines = getLogs(lines);
      console.log(logLines.join("\n"));
      process.exit(0);
      return true;
    }

    case "logs:clear": {
      clearLogs();
      console.log("✓ Logs cleared");
      process.exit(0);
      return true;
    }

    case "help":
    case "--help":
    case "-h": {
      console.log(`
cc-sync - Claude Code configuration sync

Usage:
  cc-sync              Open interactive UI
  cc-sync start        Start background sync daemon
  cc-sync stop         Stop daemon
  cc-sync restart      Restart daemon
  cc-sync status       Check daemon status
  cc-sync logs [-n N]  View recent log entries (default: 50)
  cc-sync logs:clear   Clear log file
  cc-sync sync         One-time sync (via interactive UI)
  cc-sync login        Open login page

Options:
  -h, --help           Show this help message
`);
      process.exit(0);
      return true;
    }

    default:
      return false;
  }
}

// Run daemon commands check
handleDaemonCommands().then((handled) => {
  if (handled) return;

  // Check if we have a real terminal for interactive mode
  if (!process.stdin.isTTY) {
    console.error("\n✗ Error: Interactive mode requires a terminal.");
    console.error("  For background sync, use: cc-sync start");
    console.error("  For help, use: cc-sync --help\n");
    process.exit(1);
  }

  function Root() {
    return (
      <ConvexProvider client={convex}>
        <App />
      </ConvexProvider>
    );
  }

  const { waitUntilExit } = render(<Root />, {
    exitOnCtrlC: true,
  });

  // Ensure clean exit
  waitUntilExit().then(() => {
    process.exit(0);
  });
});
