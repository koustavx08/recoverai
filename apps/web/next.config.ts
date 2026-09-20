import type { NextConfig } from "next";

/**
 * Baseline security headers applied to every response. Deliberately
 * conservative — no `Content-Security-Policy` here, since a CSP strict
 * enough to matter needs care against Next's own inline hydration
 * scripts/styles and isn't safe to add without testing every route by
 * hand; these are the well-established headers with no such risk.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@recoverai/core", "@recoverai/database", "@recoverai/analysis"],
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
