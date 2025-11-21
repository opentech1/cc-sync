// Custom handler to fix Host header issue in nextJsHandler
// The original nextJsHandler forwards the Host header from the incoming request,
// which causes Convex to reject the request with a 404.

const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
  "https://beloved-poodle-251.convex.site";

const handler = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const convexUrl = new URL(CONVEX_SITE_URL);

  // Construct the target URL on Convex
  const targetUrl = `${CONVEX_SITE_URL}${requestUrl.pathname}${requestUrl.search}`;

  // Create headers, removing Host and setting the correct one
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("host", convexUrl.host);
  headers.set("accept-encoding", "application/json");

  // Create the proxied request
  const newRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error - duplex is needed for streaming body
    duplex: "half",
    redirect: "manual",
  });

  return fetch(newRequest);
};

export const GET = handler;
export const POST = handler;
