import type { NextAuthConfig } from "next-auth";

/**
 * The Edge-safe half of the Auth.js config — no providers, no Prisma
 * import. `middleware.ts` runs on the Edge runtime, which can't load
 * `@prisma/client` (see `auth.ts`'s Credentials provider), so it builds
 * its own minimal `NextAuth(authConfig)` from just this file instead of
 * importing the full Node.js config. The `authorized` callback is what
 * actually gates every route: it runs on every matched request and
 * redirects to `/login` (with a `callbackUrl` back) when signed out, or
 * away from `/login` when already signed in.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = request.nextUrl.pathname === "/login";

      if (isLoginPage) {
        return isLoggedIn ? Response.redirect(new URL("/dashboard", request.nextUrl.origin)) : true;
      }
      return isLoggedIn;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
