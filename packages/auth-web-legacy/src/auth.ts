// Better Auth configuration for cc-sync

import { betterAuth } from "better-auth";
import { apiKey } from "better-auth/plugins";
import { Database } from "bun:sqlite";

// For development, we use an in-memory SQLite database or local file
const db = new Database("auth.db");

export const auth = betterAuth({
  database: db,

  providers: [
    {
      id: "google",
      name: "Google",
      type: "oauth2",
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        url: "https://accounts.google.com/o/oauth2/v2/auth",
        params: {
          scope: "openid email profile",
        },
      },
      token: {
        url: "https://oauth2.googleapis.com/token",
      },
      userinfo: {
        url: "https://www.googleapis.com/oauth2/v3/userinfo",
      },
    },
    {
      id: "github",
      name: "GitHub",
      type: "oauth2",
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      authorization: {
        url: "https://github.com/login/oauth/authorize",
        params: {
          scope: "read:user user:email",
        },
      },
      token: {
        url: "https://github.com/login/oauth/access_token",
      },
      userinfo: {
        url: "https://api.github.com/user",
      },
    },
  ],

  plugins: [
    apiKey({
      prefix: "ccsk_",
      length: 32,
      rateLimit: {
        max: 1000,
        window: "1h",
      },
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },

  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:8888", // CLI callback
  ],
});
