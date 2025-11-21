// Schema for cc-sync: Claude Code sync system

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema(
  {
    // Users table
    users: defineTable({
      email: v.string(),
      googleId: v.optional(v.string()),
      apiKeyHash: v.optional(v.string()),
      storageUsed: v.number(),
      storageLimit: v.number(),
      tier: v.union(v.literal("free"), v.literal("pro")),
      lastSyncAt: v.number(),
      createdAt: v.number(),
    })
      .index("by_email", ["email"])
      .index("by_google_id", ["googleId"])
      .index("by_api_key", ["apiKeyHash"]),

    // Config files (CLAUDE.md, settings.json, commands/*.md)
    configFiles: defineTable({
      userId: v.id("users"),
      deviceId: v.string(),
      filePath: v.string(), // e.g., "CLAUDE.md", "commands/solo.md"
      content: v.string(),
      contentHash: v.string(),
      lastModified: v.number(),
      version: v.number(),
      syncedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_and_path", ["userId", "filePath"])
      .index("by_user_and_device", ["userId", "deviceId"]),

    // Chat session data (todos, session-env) - limited to recent
    sessionFiles: defineTable({
      userId: v.id("users"),
      deviceId: v.string(),
      sessionId: v.string(), // Session UUID
      fileType: v.union(v.literal("todo"), v.literal("session-env")),
      filePath: v.string(),
      content: v.string(),
      contentHash: v.string(),
      lastModified: v.number(),
      version: v.number(),
      syncedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_and_path", ["userId", "filePath"])
      .index("by_user_and_type", ["userId", "fileType", "syncedAt"])
      .index("by_session", ["userId", "sessionId"]),

    // Sync conflicts table
    syncConflicts: defineTable({
      userId: v.id("users"),
      filePath: v.string(),
      deviceAId: v.string(),
      deviceBId: v.string(),
      contentA: v.string(),
      contentB: v.string(),
      createdAt: v.number(),
      resolvedAt: v.optional(v.number()),
      resolution: v.optional(
        v.union(
          v.literal("keep_local"),
          v.literal("keep_remote"),
          v.literal("keep_both"),
          v.literal("manual")
        )
      ),
    })
      .index("by_user", ["userId"])
      .index("by_user_unresolved", ["userId", "resolvedAt"]),

    // API keys table
    apiKeys: defineTable({
      userId: v.id("users"),
      keyHash: v.string(),
      keyPrefix: v.string(), // First 8 chars for display
      name: v.optional(v.string()),
      createdAt: v.number(),
      lastUsedAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
    })
      .index("by_hash", ["keyHash"])
      .index("by_user", ["userId"]),
  },
  { schemaValidation: true }
);
