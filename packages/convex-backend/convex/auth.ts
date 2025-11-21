import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";

const siteUrl = process.env.SITE_URL;
const betterAuthSecret = process.env.BETTER_AUTH_SECRET;

if (!siteUrl) {
  throw new Error("SITE_URL is required for Better Auth configuration");
}

if (!betterAuthSecret) {
  throw new Error("BETTER_AUTH_SECRET is required for Better Auth configuration");
}

export const authComponent = createClient<DataModel>(components.betterAuth);

type CreateAuthOptions = {
  optionsOnly?: boolean;
};

export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly = false }: CreateAuthOptions = {},
) => {
  return betterAuth({
    logger: { disabled: optionsOnly },
    baseURL: siteUrl,
    basePath: "/api/auth",
    secret: betterAuthSecret,
    trustedOrigins: [
      siteUrl,
      process.env.CLI_CALLBACK_URL,
      process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    ].filter(Boolean) as string[],
    database: authComponent.adapter(ctx),
    socialProviders: {
      github: {
        enabled: Boolean(
          process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET,
        ),
        clientId: process.env.GITHUB_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      },
      google: {
        enabled: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        ),
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    plugins: [
      convex({
        options: {
          basePath: "/api/auth",
        },
      }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7,
    },
  });
};

