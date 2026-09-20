import type { DefaultSession } from "next-auth";

/**
 * Every RecoverAI login is scoped to exactly one merchant (see
 * `lib/auth-seed.ts`, `auth.ts`) — `merchantId` rides through the JWT and
 * session so every server-side data loader can filter by it.
 */
declare module "next-auth" {
  interface Session {
    user: {
      merchantId: string;
    } & DefaultSession["user"];
  }

  interface User {
    merchantId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    merchantId?: string;
  }
}
