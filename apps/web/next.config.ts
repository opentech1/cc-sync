import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      {
        source: "/auth/callback/:path*",
        destination: "/api/auth/callback/:path*",
      },
    ];
  },
};

export default nextConfig;
