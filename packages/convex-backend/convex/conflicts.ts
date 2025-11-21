// Conflict resolution functions for cc-sync

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Get all unresolved conflicts for a user
 */
export const getConflicts = query({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Import helper functions
    const { validateApiKeyInternal } = await import("./_helpers");

    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    const conflicts = await ctx.db
      .query("syncConflicts")
      .withIndex("by_user_unresolved", (q) =>
        q.eq("userId", user._id).eq("resolvedAt", undefined)
      )
      .collect();

    return conflicts;
  },
});

/**
 * Get a specific conflict with full details
 */
export const getConflict = query({
  args: {
    apiKey: v.string(),
    conflictId: v.id("syncConflicts"),
  },
  handler: async (ctx, args) => {
    // Import helper functions
    const { validateApiKeyInternal } = await import("./_helpers");

    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict || conflict.userId !== user._id) {
      throw new Error("Conflict not found or unauthorized");
    }

    return conflict;
  },
});

/**
 * Merge JSON content intelligently
 */
function mergeJSON(contentA: string, contentB: string): string {
  try {
    const objA = JSON.parse(contentA);
    const objB = JSON.parse(contentB);

    // Simple deep merge (B takes precedence for conflicts)
    const merged = { ...objA, ...objB };

    return JSON.stringify(merged, null, 2);
  } catch (error) {
    // If not valid JSON, just concatenate with markers
    return `<<<<<<< VERSION A\n${contentA}\n=======\n${contentB}\n>>>>>>> VERSION B`;
  }
}

/**
 * Merge JSONL content (keep all unique lines)
 */
function mergeJSONL(contentA: string, contentB: string): string {
  const linesA = contentA.split("\n").filter(Boolean);
  const linesB = contentB.split("\n").filter(Boolean);

  // Parse and deduplicate by ID or timestamp
  const allLines = new Map<string, any>();

  for (const line of [...linesA, ...linesB]) {
    try {
      const obj = JSON.parse(line);
      const id = obj.id || obj.uuid || obj.timestamp || line;

      if (!allLines.has(id)) {
        allLines.set(id, obj);
      } else {
        // Keep newer version based on timestamp
        const existing = allLines.get(id);
        if (obj.timestamp && obj.timestamp > (existing.timestamp || 0)) {
          allLines.set(id, obj);
        }
      }
    } catch {
      // If not valid JSON, just keep the line
      allLines.set(line, line);
    }
  }

  // Sort by timestamp if available
  const sorted = Array.from(allLines.values()).sort((a, b) => {
    if (typeof a === "object" && typeof b === "object") {
      return (a.timestamp || 0) - (b.timestamp || 0);
    }
    return 0;
  });

  return sorted
    .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
    .join("\n");
}

/**
 * Resolve a conflict
 */
export const resolveConflict = mutation({
  args: {
    apiKey: v.string(),
    conflictId: v.id("syncConflicts"),
    resolution: v.union(
      v.literal("keep_local"),
      v.literal("keep_remote"),
      v.literal("keep_both"),
      v.literal("manual")
    ),
    manualContent: v.optional(v.string()),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    // Import helper functions
    const { validateApiKeyInternal } = await import("./_helpers");

    // Validate API key
    const user = await validateApiKeyInternal(ctx, args.apiKey);
    if (!user) {
      throw new Error("Invalid API key");
    }

    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict || conflict.userId !== user._id) {
      throw new Error("Conflict not found or unauthorized");
    }

    let finalContent: string;

    // Determine final content based on resolution
    switch (args.resolution) {
      case "keep_local":
        // Local is contentA if deviceA matches, otherwise contentB
        finalContent =
          conflict.deviceAId === args.deviceId
            ? conflict.contentA
            : conflict.contentB;
        break;

      case "keep_remote":
        // Remote is the opposite of local
        finalContent =
          conflict.deviceAId === args.deviceId
            ? conflict.contentB
            : conflict.contentA;
        break;

      case "keep_both":
        // Smart merge based on file type
        if (conflict.filePath.endsWith(".json")) {
          finalContent = mergeJSON(conflict.contentA, conflict.contentB);
        } else if (conflict.filePath.endsWith(".jsonl")) {
          finalContent = mergeJSONL(conflict.contentA, conflict.contentB);
        } else {
          // For other files, create side-by-side with markers
          finalContent = `<<<<<<< DEVICE ${conflict.deviceAId}\n${conflict.contentA}\n=======\n${conflict.contentB}\n>>>>>>> DEVICE ${conflict.deviceBId}`;
        }
        break;

      case "manual":
        if (!args.manualContent) {
          throw new Error("Manual content required for manual resolution");
        }
        finalContent = args.manualContent;
        break;
    }

    // Determine which table to use based on file path
    const isConfigFile =
      conflict.filePath.endsWith(".md") ||
      conflict.filePath === "settings.json" ||
      conflict.filePath === "history.jsonl" ||
      conflict.filePath.startsWith("commands/") ||
      conflict.filePath.startsWith("plugins/") ||
      conflict.filePath.startsWith("agents/");

    const tableName: "configFiles" | "sessionFiles" = isConfigFile
      ? "configFiles"
      : "sessionFiles";

    // Find the existing synced file
    const existingFile = await ctx.db
      .query(tableName)
      .withIndex("by_user_and_path", (q) =>
        q.eq("userId", user._id).eq("filePath", conflict.filePath)
      )
      .first();

    const hash = await computeHashLocal(finalContent);

    if (existingFile) {
      // Update the file
      await ctx.db.patch(existingFile._id, {
        content: finalContent,
        contentHash: hash,
        lastModified: Date.now(),
        version: existingFile.version + 1,
        syncedAt: Date.now(),
        deviceId: args.deviceId,
      });
    } else {
      // Create new file
      if (tableName === "configFiles") {
        await ctx.db.insert("configFiles", {
          userId: user._id,
          deviceId: args.deviceId,
          filePath: conflict.filePath,
          content: finalContent,
          contentHash: hash,
          lastModified: Date.now(),
          version: 1,
          syncedAt: Date.now(),
        });
      } else {
        // For session files, extract sessionId and fileType
        const sessionId =
          conflict.filePath.split("/")[1]?.split("-")[0] || "unknown";
        const fileType: "todo" | "session-env" = conflict.filePath.startsWith(
          "todos/"
        )
          ? "todo"
          : "session-env";

        await ctx.db.insert("sessionFiles", {
          userId: user._id,
          deviceId: args.deviceId,
          sessionId,
          fileType,
          filePath: conflict.filePath,
          content: finalContent,
          contentHash: hash,
          lastModified: Date.now(),
          version: 1,
          syncedAt: Date.now(),
        });
      }
    }

    // Mark conflict as resolved
    await ctx.db.patch(args.conflictId, {
      resolvedAt: Date.now(),
      resolution: args.resolution,
    });

    return {
      success: true,
      content: finalContent,
    };
  },
});

/**
 * Helper function to create a hash
 */
async function computeHashLocal(content: string): Promise<string> {
  const { computeHash } = await import("./_helpers");
  return await computeHash(content);
}
