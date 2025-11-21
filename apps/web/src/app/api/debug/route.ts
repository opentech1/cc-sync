export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const convexSiteUrl = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "https://beloved-poodle-251.convex.site").replace(/\/$/, "");

  // Test what URL would be constructed for auth
  const testPath = "/api/auth/get-session";
  const constructedUrl = `${convexSiteUrl}${testPath}`;

  // Actually test the convex endpoint
  let convexResponse = null;
  let convexError = null;
  try {
    const res = await fetch(constructedUrl, { method: "GET" });
    convexResponse = {
      status: res.status,
      statusText: res.statusText,
      body: await res.text(),
    };
  } catch (e) {
    convexError = String(e);
  }

  return Response.json({
    env: {
      NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL || "NOT_SET",
    },
    request: {
      url: request.url,
      pathname: requestUrl.pathname,
      search: requestUrl.search,
    },
    test: {
      constructedUrl,
      convexResponse,
      convexError,
    },
  });
}
