import type { NextConfig } from "next";

/**
 * `script-src`/`style-src` include `'unsafe-inline'` deliberately, not by
 * oversight: Next.js's App Router streams RSC payloads to the client via
 * inline `<script>` tags (`self.__next_f.push(...)`) on every page, with
 * no static (non-per-request-nonce) way to allow just those — a plain
 * `script-src 'self'` blocks them and breaks hydration on every route. A
 * nonce-based CSP is the strict alternative, but it requires generating a
 * fresh nonce per request in `middleware.ts` and threading it through,
 * which risks changing the behavior of the already-verified auth gate
 * that lives in the same file (see `docs/security-model.md`) — not worth
 * that risk for a static config. Everything else here is still real
 * defense in depth: no external script/style/frame/object origin is
 * ever allowed, `frame-ancestors 'none'` blocks clickjacking (redundant
 * with `X-Frame-Options` for older browsers), and `form-action`/
 * `base-uri` are pinned to this origin.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Baseline security headers applied to every response. */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
] as const;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@recoverai/core", "@recoverai/database", "@recoverai/analysis"],
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
