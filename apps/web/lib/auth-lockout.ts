import type { ISODateString, User } from "@recoverai/core";

/**
 * Simple login lockout policy: after `MAX_FAILED_LOGIN_ATTEMPTS`
 * consecutive failures, sign-in is rejected outright (without even
 * checking the password) for `LOCKOUT_DURATION_MS` — closes the
 * "no rate limiting or lockout on repeated failed logins" gap documented
 * in `docs/security-model.md#known-limitations`.
 *
 * Pure functions, no I/O — `apps/web/auth.ts` is the only caller, and
 * reads/writes the resulting state through `UserRepository`.
 */
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export function isLockedOut(user: Pick<User, "lockedUntil">, now: Date): boolean {
  if (!user.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > now.getTime();
}

/**
 * State to persist after a failed password check. An expired lock (one
 * whose window has already passed) is treated as a fresh start rather
 * than continuing to accumulate on top of it, so the attempt budget
 * renews once the cooldown elapses.
 */
export function nextStateOnFailure(
  user: Pick<User, "failedLoginAttempts" | "lockedUntil">,
  now: Date,
): { failedLoginAttempts: number; lockedUntil: ISODateString | null } {
  const lockExpired = user.lockedUntil !== null && new Date(user.lockedUntil).getTime() <= now.getTime();
  const baseAttempts = lockExpired ? 0 : user.failedLoginAttempts;
  const failedLoginAttempts = baseAttempts + 1;
  const lockedUntil =
    failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
      ? (new Date(now.getTime() + LOCKOUT_DURATION_MS).toISOString() as ISODateString)
      : null;
  return { failedLoginAttempts, lockedUntil };
}

/** State to persist after a successful sign-in — always a full reset. */
export function nextStateOnSuccess(): { failedLoginAttempts: number; lockedUntil: null } {
  return { failedLoginAttempts: 0, lockedUntil: null };
}
