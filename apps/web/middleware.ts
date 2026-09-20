import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Gates every dashboard route behind a signed-in session — closes the
 * "no authentication" gap documented in
 * `docs/security-model.md#known-limitations`. Built from `authConfig`
 * alone (not `./auth`'s full config) because middleware runs on the Edge
 * runtime, which can't load `@prisma/client` — see `auth.ts`'s doc
 * comment. The actual allow/redirect decision lives in
 * `authConfig.callbacks.authorized`.
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
