// Core sync functions for cc-sync

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { validateApiKeyInternal, computeHash } from "./_helpers";
import { rateLimiter } from "./rateLimits";

// Helper function to determine file category
function categorizeFile(filePath: string): {
  table: "configFiles" | "sessionFiles";
  sessionId?: string;
  fileType?: "todo" | "session-env";
} {
  // Config files: CLAUDE.md, settings.json, commands/*, plugins/*, agents/*
  if (
    filePath.endsWith(".md") ||
    filePath === "settings.json" ||
    filePath === "history.jsonl" ||
    filePath.startsWith("commands/") ||
    filePath.startsWith("plugins/") ||
    filePath.startsWith("agents/")
  ) {
    return { table: "configFiles" };
  }

  // Session files: todos/* and session-env/*
  if (filePath.startsWith("todos/")) {
    const sessionId = filePath.split("/")[1]?.split("-")[0] || "unknown";
    return { table: "sessionFiles", sessionId, fileType: "todo" };
  }

  if (filePath.startsWith("session-env/")) {
    const sessionId = filePath.split("/")[1] || "unknown";
    return { table: "sessionFiles", sessionId, fileType: "session-env" };
  }

  // Default to config
  return { table: "configFiles" };
}

/**
 * Push local changes to the server
 */
export const pushSync = mutation({
  args: {
    apiKey: v.string(),
    deviceId: v.string(),
    files: v.array(
      v.object({
        filePath: v.string(),
        content: v.string(),
        contentHash: v.string(),
        lastModified: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    // Apply rate limiting per user
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "syncOperation", {
      key: user._id,
    });

    if (!ok) {
      throw new Error(
        `Rate limit exceeded. Try again in ${Math.ceil(retryAfter / 1000)}s`
      );
    }

    const results: Array<{
      filePath: string;
      status: "success" | "conflict" | "error";
      conflictId?: Id<"syncConflicts">;
      message?: string;
    }> = [];

    // Process each file
    for (const file of args.files) {
      try {
        const category = categorizeFile(file.filePath);
        const tableName = category.table;

        // Check storage quota
        const fileSize = new Blob([file.content]).size;
        if (user.storageUsed + fileSize > user.storageLimit) {
          results.push({
            filePath: file.filePath,
            status: "error",
            message: "Storage quota exceeded",
          });
          continue;
        }

        // Find existing file in appropriate table
        const existing = await ctx.db
          .query(tableName)
          .withIndex("by_user_and_path", (q) =>
            q.eq("userId", user._id).eq("filePath", file.filePath)
          )
          .first();

        if (existing) {
          // Skip if content hasn't changed (same hash)
          if (existing.contentHash === file.contentHash) {
            results.push({
              filePath: file.filePath,
              status: "success",
            });
            continue;
          }

          // Conflict detection: different content from different device
          const hasConflict =
            existing.contentHash !== file.contentHash &&
            existing.deviceId !== args.deviceId;

          if (hasConflict) {
            // Create conflict record
            const conflictId = await ctx.db.insert("syncConflicts", {
              userId: user._id,
              filePath: file.filePath,
              deviceAId: existing.deviceId,
              deviceBId: args.deviceId,
              contentA: existing.content,
              contentB: file.content,
              createdAt: Date.now(),
            });

            results.push({
              filePath: file.filePath,
              status: "conflict",
              conflictId,
            });
            continue;
          }

          // Update existing file (content changed on same device or newer version)
          await ctx.db.patch(existing._id, {
            content: file.content,
            contentHash: file.contentHash,
            lastModified: file.lastModified,
            version: existing.version + 1,
            syncedAt: Date.now(),
            deviceId: args.deviceId,
          });

          results.push({
            filePath: file.filePath,
            status: "success",
          });
        } else {
          // Insert new file in appropriate table
          if (tableName === "configFiles") {
            await ctx.db.insert("configFiles", {
              userId: user._id,
              deviceId: args.deviceId,
              filePath: file.filePath,
              content: file.content,
              contentHash: file.contentHash,
              lastModified: file.lastModified,
              version: 1,
              syncedAt: Date.now(),
            });
          } else {
            // Session files need sessionId and fileType
            await ctx.db.insert("sessionFiles", {
              userId: user._id,
              deviceId: args.deviceId,
              sessionId: category.sessionId || "unknown",
              fileType: category.fileType || "todo",
              filePath: file.filePath,
              content: file.content,
              contentHash: file.contentHash,
              lastModified: file.lastModified,
              version: 1,
              syncedAt: Date.now(),
            });
          }

          // Update storage used
          await ctx.db.patch(user._id, {
            storageUsed: user.storageUsed + fileSize,
          });

          results.push({
            filePath: file.filePath,
            status: "success",
          });
        }
      } catch (error) {
        results.push({
          filePath: file.filePath,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update last sync time
    await ctx.db.patch(user._id, { lastSyncAt: Date.now() });

    return { results };
  },
});

/**
 * Pull remote changes from the server
 */
export const pullSync = query({
  args: {
    apiKey: v.string(),
    deviceId: v.string(),
    lastSyncTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    // Get config files
    const configFiles = await ctx.db
      .query("configFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Get session files
    const sessionFiles = await ctx.db
      .query("sessionFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Combine all files
    const allFiles = [...configFiles, ...sessionFiles];

    // Filter files
    const filteredFiles = allFiles.filter((file) => {
      // NEVER include files from the same device (avoid downloading what we just uploaded)
      if (file.deviceId === args.deviceId) {
        return false;
      }

      // If lastSyncTime is provided, only include files synced after it
      if (args.lastSyncTime !== undefined) {
        return file.syncedAt > args.lastSyncTime;
      }

      // First sync: include all files from other devices
      return true;
    });

    return {
      files: filteredFiles.map((file) => ({
        id: file._id,
        filePath: file.filePath,
        content: file.content,
        contentHash: file.contentHash,
        lastModified: file.lastModified,
        version: file.version,
        syncedAt: file.syncedAt,
        deviceId: file.deviceId,
      })),
    };
  },
});

/**
 * Subscribe to changes for real-time updates
 */
export const subscribeToChanges = query({
  args: {
    apiKey: v.string(),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      return { files: [], conflicts: [] };
    }

    // Get recent config files (not from this device)
    const configFiles = await ctx.db
      .query("configFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Get recent session files (not from this device)
    const sessionFiles = await ctx.db
      .query("sessionFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const allFiles = [...configFiles, ...sessionFiles];
    const recentFiles = allFiles
      .filter((f) => f.deviceId !== args.deviceId)
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, 20); // Last 20 changes

    // Get unresolved conflicts
    const conflicts = await ctx.db
      .query("syncConflicts")
      .withIndex("by_user_unresolved", (q) =>
        q.eq("userId", user._id).eq("resolvedAt", undefined)
      )
      .collect();

    return {
      files: recentFiles.map((file) => ({
        id: file._id,
        filePath: file.filePath,
        contentHash: file.contentHash,
        lastModified: file.lastModified,
        version: file.version,
        deviceId: file.deviceId,
      })),
      conflicts: conflicts.map((c) => ({
        id: c._id,
        filePath: c.filePath,
        deviceAId: c.deviceAId,
        deviceBId: c.deviceBId,
        createdAt: c.createdAt,
      })),
    };
  },
});

/**
 * Get storage info for a user
 */
export const getStorageInfo = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    return {
      used: user.storageUsed,
      limit: user.storageLimit,
      percentage: (user.storageUsed / user.storageLimit) * 100,
      tier: user.tier,
    };
  },
});

/**
 * Delete a synced file (works for both config and session files)
 */
export const deleteFile = mutation({
  args: {
    apiKey: v.string(),
    fileId: v.union(v.id("configFiles"), v.id("sessionFiles")),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    const file = await ctx.db.get(args.fileId);
    if (!file || file.userId !== user._id) {
      throw new Error("File not found or unauthorized");
    }

    // Update storage used
    const fileSize = new Blob([file.content]).size;
    await ctx.db.patch(user._id, {
      storageUsed: Math.max(0, user.storageUsed - fileSize),
    });

    await ctx.db.delete(args.fileId);

    return { success: true };
  },
});

/**
 * Clear all synced files for a user (for testing/debugging)
 */
export const clearAllFiles = mutation({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    // Get all config files
    const configFiles = await ctx.db
      .query("configFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Get all session files
    const sessionFiles = await ctx.db
      .query("sessionFiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Delete all config files
    for (const file of configFiles) {
      await ctx.db.delete(file._id);
    }

    // Delete all session files
    for (const file of sessionFiles) {
      await ctx.db.delete(file._id);
    }

    // Reset storage used
    await ctx.db.patch(user._id, {
      storageUsed: 0,
    });

    return {
      success: true,
      deletedCount: configFiles.length + sessionFiles.length,
    };
  },
});
