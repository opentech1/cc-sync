// Hono server for cc-sync auth web UI

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { auth } from "./auth";

const app = new Hono();

// Mount Better Auth handler
app.all("/api/auth/*", (c) => {
  return auth.handler(c.req.raw);
});

// Serve a simple HTML page for login
app.get("/", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Claude Code Sync - Login</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          font-size: 28px;
          margin-bottom: 8px;
          color: #333;
        }

        p {
          color: #666;
          margin-bottom: 30px;
        }

        .google-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 14px 20px;
          background: white;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          color: #333;
          cursor: pointer;
          transition: all 0.2s;
        }

        .google-btn:hover {
          background: #f8f8f8;
          border-color: #667eea;
        }

        .google-icon {
          width: 20px;
          height: 20px;
        }

        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
          text-align: center;
          color: #999;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Claude Code Sync</h1>
        <p>Sync your Claude Code data across devices securely</p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <a href="/auth/google" style="text-decoration: none;">
            <button class="google-btn">
              <svg class="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </a>

          <a href="/auth/github" style="text-decoration: none;">
            <button class="google-btn" style="background: #24292e; color: white; border-color: #24292e;">
              <svg class="google-icon" viewBox="0 0 24 24" fill="white">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>
          </a>
        </div>

        <div class="footer">
          Secure authentication powered by Better Auth
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get("/auth/github", async (c) => {
  const redirectUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&redirect_uri=http://localhost:3001/auth/callback/github&scope=read:user user:email`;
  return c.redirect(redirectUrl);
});

app.get("/auth/callback/github", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.text("Authorization failed", 400);
  }

  // In production, we would exchange this code for a token
  // For now, we'll just show the success page with the API key
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Success - Claude Code Sync</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          font-size: 28px;
          margin-bottom: 8px;
          color: #333;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          display: block;
        }

        p {
          color: #666;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        .api-key {
          background: #f8f8f8;
          border: 2px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 14px;
          word-break: break-all;
          margin: 20px 0;
        }

        .copy-btn {
          width: 100%;
          padding: 14px 20px;
          background: #667eea;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-btn:hover {
          background: #5568d3;
        }

        .instructions {
          margin-top: 30px;
          padding: 20px;
          background: #f0f7ff;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .instructions h3 {
          margin-bottom: 12px;
          color: #333;
        }

        .instructions ol {
          margin-left: 20px;
          color: #666;
        }

        .instructions li {
          margin-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="success-icon" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
          <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>

        <h1>Success!</h1>
        <p>Your account has been authenticated with GitHub. Here's your API key:</p>

        <div class="api-key" id="apiKey">
          ccsk_github_demo_key_${Math.random().toString(36).substring(7)}
        </div>

        <button class="copy-btn" onclick="copyApiKey()">
          Copy API Key
        </button>

        <div class="instructions">
          <h3>Next Steps:</h3>
          <ol>
            <li>Copy your API key above</li>
            <li>Run <code>cc-sync login</code> in your terminal</li>
            <li>Paste your API key when prompted</li>
            <li>Start syncing your Claude Code data!</li>
          </ol>
        </div>
      </div>

      <script>
        function copyApiKey() {
          const apiKey = document.getElementById('apiKey').textContent.trim();
          navigator.clipboard.writeText(apiKey).then(() => {
            const btn = document.querySelector('.copy-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Google OAuth routes
app.get("/auth/google", async (c) => {
  // Redirect to Google OAuth
  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=http://localhost:3000/auth/callback/google&response_type=code&scope=openid email profile`;
  return c.redirect(redirectUrl);
});

app.get("/auth/callback/google", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.text("Authorization failed", 400);
  }

  // Exchange code for token
  // In production, use Better Auth's built-in OAuth handling
  // For now, show success and display API key generation page

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Success - Claude Code Sync</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .container {
          background: white;
          border-radius: 12px;
          padding: 40px;
          max-width: 500px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          font-size: 28px;
          margin-bottom: 8px;
          color: #333;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 20px;
          display: block;
        }

        p {
          color: #666;
          margin-bottom: 20px;
          line-height: 1.6;
        }

        .api-key {
          background: #f8f8f8;
          border: 2px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          font-family: 'Monaco', 'Menlo', monospace;
          font-size: 14px;
          word-break: break-all;
          margin: 20px 0;
        }

        .copy-btn {
          width: 100%;
          padding: 14px 20px;
          background: #667eea;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .copy-btn:hover {
          background: #5568d3;
        }

        .instructions {
          margin-top: 30px;
          padding: 20px;
          background: #f0f7ff;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .instructions h3 {
          margin-bottom: 12px;
          color: #333;
        }

        .instructions ol {
          margin-left: 20px;
          color: #666;
        }

        .instructions li {
          margin-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="success-icon" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
          <path d="M7 12l3 3 7-7" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>

        <h1>Success!</h1>
        <p>Your account has been authenticated. Here's your API key:</p>

        <div class="api-key" id="apiKey">
          ccsk_demo_key_for_testing_only_replace_with_real_key
        </div>

        <button class="copy-btn" onclick="copyApiKey()">
          Copy API Key
        </button>

        <div class="instructions">
          <h3>Next Steps:</h3>
          <ol>
            <li>Copy your API key above</li>
            <li>Run <code>cc-sync login</code> in your terminal</li>
            <li>Paste your API key when prompted</li>
            <li>Start syncing your Claude Code data!</li>
          </ol>
        </div>
      </div>

      <script>
        function copyApiKey() {
          const apiKey = document.getElementById('apiKey').textContent.trim();
          navigator.clipboard.writeText(apiKey).then(() => {
            const btn = document.querySelector('.copy-btn');
            const originalText = btn.textContent;
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
              btn.textContent = originalText;
            }, 2000);
          });
        }
      </script>
    </body>
    </html>
  `);
});

// API endpoint to generate API key (called after authentication)
app.post("/api/keys/generate", async (c) => {
  // In production, verify session and generate real API key via Convex
  // For now, return a demo key
  return c.json({
    apiKey: "ccsk_" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join(""),
    keyPrefix: "ccsk_...",
  });
});

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Start server
const port = parseInt(process.env.PORT || "3001");

console.log(`🔐 Auth server starting on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
