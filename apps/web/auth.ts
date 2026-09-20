import bcrypt from "bcryptjs";
import NextAuth, { type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { createPrismaDatabase } from "@recoverai/database";
import { authConfig } from "./auth.config";
import { ensureDemoUsersSeeded } from "./lib/auth-seed";

/**
 * Dashboard authentication — JWT sessions (no `Session`/`Account` tables
 * needed), one Credentials provider backed by `@recoverai/database`'s
 * `UserRepository`. Every successful sign-in carries `merchantId` through
 * the JWT/session (see `types/next-auth.d.ts`) so every server-side data
 * loader can scope its queries to the signed-in merchant — see
 * `docs/security-model.md#known-limitations` for the gap this closes.
 *
 * This is the full, Node.js-only config (the Credentials provider below
 * imports `@recoverai/database`, which needs `@prisma/client` — not
 * Edge-runtime-safe). `middleware.ts` builds its own Edge-safe
 * `NextAuth(authConfig)` from just `auth.config.ts` instead of importing
 * this file, per Auth.js's documented "split config" pattern for
 * Prisma + middleware.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const db = createPrismaDatabase();
        await ensureDemoUsersSeeded(db);

        const user = await db.users.findByEmail(email);
        if (!user) return null;

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        return { id: user.id, email: user.email, merchantId: user.merchantId };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) token.merchantId = user.merchantId;
      return token;
    },
    // Explicitly annotated (not just inferred) — Auth.js's callbacks.session
    // type is a database-strategy/JWT-strategy intersection; annotating
    // pins this to the JWT-strategy shape this app actually uses (no
    // adapter is configured), so `session.user.merchantId` resolves to the
    // augmented `string` type from types/next-auth.d.ts.
    session({ session, token }: { session: Session; token: JWT }) {
      if (token.merchantId) session.user.merchantId = token.merchantId;
      return session;
    },
  },
});
