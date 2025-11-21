import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Hash an API key for storage using Web Crypto API
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  const prefix = "ccsk_";
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}${key}`;
}

/**
 * Create or get a user by email (for OAuth)
 */
export const createOrGetUser = mutation({
  args: {
    email: v.string(),
    googleId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if user exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      // Update Google ID if provided and different
      if (args.googleId && existing.googleId !== args.googleId) {
        await ctx.db.patch(existing._id, { googleId: args.googleId });
      }
      return existing._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      email: args.email,
      googleId: args.googleId,
      storageUsed: 0,
      storageLimit: 100 * 1024 * 1024, // 100MB for free tier
      tier: "free",
      lastSyncAt: Date.now(),
      createdAt: Date.now(),
    });

    return userId;
  },
});

/**
 * Create a new API key for a user
 */
export const createApiKey = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Generate API key
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);
    const keyPrefix = apiKey.substring(0, 12); // First 12 chars for display

    // Store hashed key
    const keyId = await ctx.db.insert("apiKeys", {
      userId: args.userId,
      keyHash,
      keyPrefix,
      name: args.name,
      createdAt: Date.now(),
    });

    // Return the actual key (only time it's visible!)
    return { keyId, apiKey, keyPrefix };
  },
});
