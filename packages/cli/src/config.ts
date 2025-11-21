/**
 * Production configuration for cc-sync CLI
 * URLs are set at build time or via environment variables
 */

// Convex deployment URL - this will be the production URL
// The CONVEX_URL env var allows overriding for development
export const CONVEX_URL = process.env.CONVEX_URL || "https://hardy-greyhound-996.convex.cloud";

// Auth web URL - this will be your Vercel deployment
// Set CC_SYNC_AUTH_URL env var or update this after deploying
export const AUTH_WEB_URL = process.env.CC_SYNC_AUTH_URL || "https://cc-sync.vercel.app";

// For development, you can override with:
// CONVEX_URL=https://your-dev.convex.cloud CC_SYNC_AUTH_URL=http://localhost:3001 cc-sync
