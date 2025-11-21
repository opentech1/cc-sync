import { nextJsHandler } from "@convex-dev/better-auth/nextjs";

export const { GET, POST } = nextJsHandler({
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
});
