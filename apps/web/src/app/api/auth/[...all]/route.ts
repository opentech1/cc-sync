import { nextJsHandler } from "@convex-dev/better-auth/nextjs";

// Hardcode fallback for reliability - env var should work but may be undefined at build time
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://beloved-poodle-251.convex.site";

export const { GET, POST } = nextJsHandler({
  convexSiteUrl: CONVEX_SITE_URL,
});
