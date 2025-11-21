export function GET() {
  return Response.json({
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "NOT_SET",
    CONVEX_SITE_URL_FALLBACK: "https://beloved-poodle-251.convex.site",
  });
}
