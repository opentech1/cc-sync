#!/usr/bin/env bun
/**
 * Sync Testing Environment
 * Simulates two devices and tests all sync scenarios
 */

import fs from "fs";
import path from "path";
import os from "os";
import { ConvexReactClient } from "convex/react";
import { api } from "../../convex-backend/convex/_generated/api";
import { readLocalFiles, writeLocalFiles } from "./sync-utils";

const CONVEX_URL = process.env.CONVEX_URL || "https://hardy-greyhound-996.convex.cloud";
const convex = new ConvexReactClient(CONVEX_URL);

// Test configuration
const TEST_API_KEY = process.env.TEST_API_KEY;
const DEVICE_A_ID = "test-device-a";
const DEVICE_B_ID = "test-device-b";

// Create test directories
const TEST_DIR_A = path.join(os.tmpdir(), "cc-sync-test-device-a");
const TEST_DIR_B = path.join(os.tmpdir(), "cc-sync-test-device-b");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function cleanup() {
  log("\n🧹 Cleaning up test directories...", "cyan");
  if (fs.existsSync(TEST_DIR_A)) fs.rmSync(TEST_DIR_A, { recursive: true });
  if (fs.existsSync(TEST_DIR_B)) fs.rmSync(TEST_DIR_B, { recursive: true });
}

function setupTestDirs() {
  log("📁 Setting up test directories...", "cyan");
  cleanup();

  fs.mkdirSync(TEST_DIR_A, { recursive: true });
  fs.mkdirSync(TEST_DIR_B, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR_A, "commands"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR_A, "todos"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR_A, "session-env"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR_A, "plugins"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR_A, "agents"), { recursive: true });
}

async function clearDatabase() {
  log("\n🗑️  Clearing database...", "cyan");
  try {
    const result = await convex.mutation(api.sync.clearAllFiles, {
      apiKey: TEST_API_KEY!,
    });
    log(`   ✓ Cleared ${result.deletedCount} files`, "green");
  } catch (error) {
    log(`   ✗ Error: ${error}`, "red");
    throw error;
  }
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncDevice(deviceId: string, testDir: string, lastSyncTime?: number) {
  log(`\n🔄 Syncing ${deviceId}...`, "blue");

  // Add 7 second delay to respect rate limits (10 syncs/min = 1 every 6s)
  await delay(7000);

  // Pull first
  const pullResult = await convex.query(api.sync.pullSync, {
    apiKey: TEST_API_KEY!,
    deviceId,
    lastSyncTime,
  });

  log(`   ⬇️  Downloaded ${pullResult.files.length} files`, "cyan");

  if (pullResult.files.length > 0) {
    writeLocalFiles(testDir, pullResult.files);
  }

  // Then push
  const localFiles = readLocalFiles(testDir);
  log(`   ⬆️  Uploading ${localFiles.length} files`, "cyan");

  const pushResult = await convex.mutation(api.sync.pushSync, {
    apiKey: TEST_API_KEY!,
    deviceId,
    files: localFiles,
  });

  const successCount = pushResult.results.filter(r => r.status === "success").length;
  const conflictCount = pushResult.results.filter(r => r.status === "conflict").length;
  const errorCount = pushResult.results.filter(r => r.status === "error").length;

  log(`   ✓ Uploaded: ${successCount}, Conflicts: ${conflictCount}, Errors: ${errorCount}`, "green");

  return { pullResult, pushResult };
}

async function test1_BasicConfigSync() {
  log("\n" + "=".repeat(60), "yellow");
  log("TEST 1: Basic Config File Sync", "yellow");
  log("=".repeat(60), "yellow");

  // Device A: Create files
  log("\n📝 Device A: Creating test files...", "blue");
  fs.writeFileSync(path.join(TEST_DIR_A, "CLAUDE.md"), "# My Claude Config\n- Test instruction 1\n");
  fs.writeFileSync(path.join(TEST_DIR_A, "settings.json"), JSON.stringify({ theme: "dark", fontSize: 14 }, null, 2));
  fs.writeFileSync(path.join(TEST_DIR_A, "commands/test.md"), "Test slash command");
  log("   ✓ Created CLAUDE.md, settings.json, commands/test.md", "green");

  // Device A: Sync
  await syncDevice(DEVICE_A_ID, TEST_DIR_A);

  // Device B: Sync (should download)
  await syncDevice(DEVICE_B_ID, TEST_DIR_B);

  // Verify Device B has the files
  log("\n✅ Verifying Device B received files...", "cyan");
  const claudeExists = fs.existsSync(path.join(TEST_DIR_B, "CLAUDE.md"));
  const settingsExists = fs.existsSync(path.join(TEST_DIR_B, "settings.json"));
  const commandExists = fs.existsSync(path.join(TEST_DIR_B, "commands/test.md"));

  if (claudeExists && settingsExists && commandExists) {
    log("   ✓ All files synced successfully!", "green");

    const claudeContent = fs.readFileSync(path.join(TEST_DIR_B, "CLAUDE.md"), "utf-8");
    log(`   ✓ CLAUDE.md content: "${claudeContent.trim()}"`, "green");
  } else {
    log("   ✗ Some files missing!", "red");
    throw new Error("Test 1 failed: Files not synced");
  }
}

async function test2_PluginsAndAgents() {
  log("\n" + "=".repeat(60), "yellow");
  log("TEST 2: Plugins and Agents Sync", "yellow");
  log("=".repeat(60), "yellow");

  // Device A: Create plugin and agent files
  log("\n📝 Device A: Creating plugins and agents...", "blue");
  fs.writeFileSync(path.join(TEST_DIR_A, "plugins/test-plugin.json"), JSON.stringify({ name: "test-plugin" }));
  fs.writeFileSync(path.join(TEST_DIR_A, "agents/test-agent.json"), JSON.stringify({ name: "test-agent" }));
  log("   ✓ Created plugin and agent files", "green");

  // Device A: Sync
  await syncDevice(DEVICE_A_ID, TEST_DIR_A);

  // Device B: Sync (should download)
  await syncDevice(DEVICE_B_ID, TEST_DIR_B);

  // Verify
  log("\n✅ Verifying Device B received plugins/agents...", "cyan");
  const pluginExists = fs.existsSync(path.join(TEST_DIR_B, "plugins/test-plugin.json"));
  const agentExists = fs.existsSync(path.join(TEST_DIR_B, "agents/test-agent.json"));

  if (pluginExists && agentExists) {
    log("   ✓ Plugins and agents synced successfully!", "green");
  } else {
    log("   ✗ Plugins or agents missing!", "red");
    throw new Error("Test 2 failed: Plugins/agents not synced");
  }
}

async function test3_SessionFiles() {
  log("\n" + "=".repeat(60), "yellow");
  log("TEST 3: Session Files (Todos & Session-Env)", "yellow");
  log("=".repeat(60), "yellow");

  // Device A: Create session files
  log("\n📝 Device A: Creating session files...", "blue");
  const sessionId = "abc123-def456";
  fs.writeFileSync(
    path.join(TEST_DIR_A, `todos/${sessionId}-agent-${sessionId}.json`),
    JSON.stringify([{ content: "Test todo", status: "pending" }])
  );
  fs.mkdirSync(path.join(TEST_DIR_A, `session-env/${sessionId}`), { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR_A, `session-env/${sessionId}/test.json`),
    JSON.stringify({ env: "test" })
  );
  log("   ✓ Created session files", "green");

  // Device A: Sync
  await syncDevice(DEVICE_A_ID, TEST_DIR_A);

  // Device B: Sync (should download)
  await syncDevice(DEVICE_B_ID, TEST_DIR_B);

  // Verify
  log("\n✅ Verifying Device B received session files...", "cyan");
  const todoExists = fs.existsSync(path.join(TEST_DIR_B, `todos/${sessionId}-agent-${sessionId}.json`));
  const sessionEnvExists = fs.existsSync(path.join(TEST_DIR_B, `session-env/${sessionId}/test.json`));

  if (todoExists && sessionEnvExists) {
    log("   ✓ Session files synced successfully!", "green");
  } else {
    log("   ✗ Session files missing!", "red");
    throw new Error("Test 3 failed: Session files not synced");
  }
}

async function test4_MergeConflict() {
  log("\n" + "=".repeat(60), "yellow");
  log("TEST 4: Merge Conflict Detection", "yellow");
  log("=".repeat(60), "yellow");

  // Both devices modify the same file
  log("\n📝 Device A: Modifying CLAUDE.md...", "blue");
  fs.writeFileSync(path.join(TEST_DIR_A, "CLAUDE.md"), "# Device A Version\n- Modified by Device A\n");

  log("📝 Device B: Modifying CLAUDE.md (different content)...", "blue");
  fs.writeFileSync(path.join(TEST_DIR_B, "CLAUDE.md"), "# Device B Version\n- Modified by Device B\n");

  // Device A syncs first
  await syncDevice(DEVICE_A_ID, TEST_DIR_A);

  // Device B pulls (gets Device A's version)
  log("\n⚠️  Device B pulling changes...", "yellow");
  await delay(7000);
  const pullResult = await convex.query(api.sync.pullSync, {
    apiKey: TEST_API_KEY!,
    deviceId: DEVICE_B_ID,
  });

  log(`   ⬇️  Downloaded ${pullResult.files.length} files`, "cyan");

  // Now modify AFTER pulling to create a real conflict
  log("📝 Device B: Modifying CLAUDE.md AGAIN (after pull)...", "blue");
  fs.writeFileSync(path.join(TEST_DIR_B, "CLAUDE.md"), "# Device B Version AFTER PULL\n- Modified by Device B after seeing Device A's changes\n");

  // Device B pushes - should detect conflict
  log("\n⚠️  Device B pushing (should detect conflict)...", "yellow");
  await delay(7000);
  const localFiles = readLocalFiles(TEST_DIR_B);
  const pushResult = await convex.mutation(api.sync.pushSync, {
    apiKey: TEST_API_KEY!,
    deviceId: DEVICE_B_ID,
    files: localFiles,
  });

  const conflicts = pushResult.results.filter(r => r.status === "conflict");

  if (conflicts.length > 0) {
    log(`   ✓ Conflict detected for ${conflicts.length} file(s)!`, "green");
    log(`   ✓ Conflict ID: ${conflicts[0].conflictId}`, "green");
  } else {
    log("   ✗ No conflict detected!", "red");
    throw new Error("Test 4 failed: Conflict not detected");
  }
}

async function test5_IdempotentSync() {
  log("\n" + "=".repeat(60), "yellow");
  log("TEST 5: Idempotent Sync (No Changes)", "yellow");
  log("=".repeat(60), "yellow");

  log("\n🔄 Device A: Syncing without changes...", "blue");
  const result = await syncDevice(DEVICE_A_ID, TEST_DIR_A);

  // Should have 0 changes since nothing was modified
  const changes = result.pullResult.files.length;

  if (changes === 0) {
    log("   ✓ No unnecessary uploads/downloads!", "green");
  } else {
    log(`   ⚠️  Unexpected ${changes} changes detected`, "yellow");
  }
}

async function runAllTests() {
  log("\n" + "=".repeat(60), "cyan");
  log("🧪 CC-SYNC TESTING SUITE", "cyan");
  log("=".repeat(60), "cyan");

  if (!TEST_API_KEY) {
    log("\n❌ Error: TEST_API_KEY environment variable not set", "red");
    log("   Set it with: export TEST_API_KEY=your_api_key", "yellow");
    process.exit(1);
  }

  try {
    setupTestDirs();
    await clearDatabase();

    await test1_BasicConfigSync();
    await test2_PluginsAndAgents();
    await test3_SessionFiles();
    await test4_MergeConflict();
    await test5_IdempotentSync();

    log("\n" + "=".repeat(60), "green");
    log("✅ ALL TESTS PASSED!", "green");
    log("=".repeat(60), "green");

  } catch (error) {
    log("\n" + "=".repeat(60), "red");
    log("❌ TEST SUITE FAILED", "red");
    log("=".repeat(60), "red");
    log(`\nError: ${error}`, "red");
    process.exit(1);
  } finally {
    cleanup();
    log("\n👋 Test environment cleaned up\n", "cyan");
  }
}

// Run the tests
runAllTests();
