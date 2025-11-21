// Internal helper functions (not exposed as endpoints)

import { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import { DataModel, Id } from "./_generated/dataModel";

type QueryCtx = GenericQueryCtx<DataModel>;
type MutationCtx = GenericMutationCtx<DataModel>;

/**
 * Hash an API key for storage using Web Crypto API
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate API key and return user (helper for internal use)
 */
export async function validateApiKeyInternal(
  ctx: QueryCtx | MutationCtx,
  apiKey: string
) {
  const keyHash = await hashApiKey(apiKey);

  const apiKeyRecord = await ctx.db
    .query("apiKeys")
    .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
    .first();

  if (!apiKeyRecord || apiKeyRecord.revokedAt) {
    return null;
  }

  return await ctx.db.get(apiKeyRecord.userId);
}

/**
 * Compute content hash using Web Crypto API
 */
export async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
