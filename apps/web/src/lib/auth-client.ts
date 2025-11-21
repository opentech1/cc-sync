import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Use Convex site URL directly for auth - env var should work but hardcoding for reliability
const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://beloved-poodle-251.convex.site";

export const authClient = createAuthClient({
  baseURL: CONVEX_SITE_URL,
  plugins: [convexClient()],
});
