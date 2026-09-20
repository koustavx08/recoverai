import { describe, expect, it } from "vitest";
import type { ISODateString } from "@recoverai/core";
import {
  isLockedOut,
  LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  nextStateOnFailure,
  nextStateOnSuccess,
} from "./auth-lockout";

const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("isLockedOut", () => {
  it("is false when lockedUntil is null", () => {
    expect(isLockedOut({ lockedUntil: null }, NOW)).toBe(false);
  });

  it("is true when lockedUntil is in the future", () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString() as ISODateString;
    expect(isLockedOut({ lockedUntil: future }, NOW)).toBe(true);
  });

  it("is false when lockedUntil is in the past", () => {
    const past = new Date(NOW.getTime() - 60_000).toISOString() as ISODateString;
    expect(isLockedOut({ lockedUntil: past }, NOW)).toBe(false);
  });
});

describe("nextStateOnFailure", () => {
  it("increments failedLoginAttempts without locking below the threshold", () => {
    const result = nextStateOnFailure({ failedLoginAttempts: 1, lockedUntil: null }, NOW);
    expect(result).toEqual({ failedLoginAttempts: 2, lockedUntil: null });
  });

  it("locks the account once the threshold is reached", () => {
    const result = nextStateOnFailure(
      { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1, lockedUntil: null },
      NOW,
    );
    expect(result.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(result.lockedUntil).toBe(new Date(NOW.getTime() + LOCKOUT_DURATION_MS).toISOString());
  });

  it("restarts the count from zero once a previous lock has expired", () => {
    const expiredLock = new Date(NOW.getTime() - 1).toISOString() as ISODateString;
    const result = nextStateOnFailure(
      { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: expiredLock },
      NOW,
    );
    expect(result).toEqual({ failedLoginAttempts: 1, lockedUntil: null });
  });

  it("does not restart the count while still within an active lock", () => {
    const activeLock = new Date(NOW.getTime() + 60_000).toISOString() as ISODateString;
    const result = nextStateOnFailure(
      { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: activeLock },
      NOW,
    );
    expect(result.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS + 1);
  });
});

describe("nextStateOnSuccess", () => {
  it("fully resets attempt state", () => {
    expect(nextStateOnSuccess()).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });
});
