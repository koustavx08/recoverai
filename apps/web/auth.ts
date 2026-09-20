import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import NextAuth, { type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { createPrismaDatabase } from "@recoverai/database";
import { brand, type AuditEvent } from "@recoverai/core";
import { authConfig } from "./auth.config";
import { ensureDemoUsersSeeded } from "./lib/auth-seed";
import { isLockedOut, nextStateOnFailure, nextStateOnSuccess } from "./lib/auth-lockout";

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

        // Deliberately no audit event for an unrecognized email — an
        // AuditEvent requires a merchantId, and there is none to attach a
        // failed attempt against an account that does not exist to; it
        // also avoids persisting arbitrary attacker-supplied email
        // strings verbatim into the audit trail.
        const user = await db.users.findByEmail(email);
        if (!user) return null;

        const now = new Date();

        const recordFailure = async (reason: "locked" | "bad_password") => {
          if (reason === "bad_password") {
            await db.users.save({ ...user, ...nextStateOnFailure(user, now) });
          }
          const event: AuditEvent = {
            id: brand<string, "AuditEventId">(randomUUID()),
            type: "user_sign_in_failed",
            merchantId: user.merchantId,
            actorType: "user",
            actorId: user.id,
            summary: `Sign-in failed for ${user.email} (${reason === "locked" ? "account locked" : "incorrect password"}).`,
            data: { reason },
            occurredAt: brand<string, "ISODateString">(now.toISOString()),
          };
          await db.auditEvents.append(event);
        };

        if (isLockedOut(user, now)) {
          await recordFailure("locked");
          return null;
        }

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) {
          await recordFailure("bad_password");
          return null;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await db.users.save({ ...user, ...nextStateOnSuccess() });
        }
        const signedInEvent: AuditEvent = {
          id: brand<string, "AuditEventId">(randomUUID()),
          type: "user_signed_in",
          merchantId: user.merchantId,
          actorType: "user",
          actorId: user.id,
          summary: `${user.email} signed in.`,
          data: {},
          occurredAt: brand<string, "ISODateString">(now.toISOString()),
        };
        await db.auditEvents.append(signedInEvent);

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
