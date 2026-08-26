import { envSchema } from "./schema.js";
import { ConfigValidationError } from "./errors.js";
import type { AppConfig } from "./types.js";

/**
 * Parses and validates `process.env` (or a supplied env map) into a typed
 * `AppConfig`. Throws `ConfigValidationError` with a human-readable summary
 * of every problem found — this is meant to fail loudly and immediately at
 * process startup, not to be caught and silently ignored.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new ConfigValidationError(issues);
  }

  const raw = parsed.data;
  const issues: string[] = [];
  const isProduction = raw.NODE_ENV === "production";

  if (isProduction && !raw.DATABASE_URL) {
    issues.push("DATABASE_URL is required when NODE_ENV=production.");
  }

  if (raw.PAYMENT_PROVIDER === "razorpay") {
    if (!raw.RAZORPAY_KEY_ID) {
      issues.push("RAZORPAY_KEY_ID is required when PAYMENT_PROVIDER=razorpay.");
    }
    if (!raw.RAZORPAY_KEY_SECRET) {
      issues.push("RAZORPAY_KEY_SECRET is required when PAYMENT_PROVIDER=razorpay.");
    }
  }

  if (isProduction && (!raw.AI_API_KEY || !raw.AI_MODEL)) {
    issues.push(
      "AI_API_KEY and AI_MODEL are required when NODE_ENV=production and agent execution is enabled.",
    );
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    nodeEnv: raw.NODE_ENV,
    isProduction,
    appUrl: raw.NEXT_PUBLIC_APP_URL,
    database: {
      url: raw.DATABASE_URL,
    },
    payments: {
      provider: raw.PAYMENT_PROVIDER,
      razorpay:
        raw.RAZORPAY_KEY_ID && raw.RAZORPAY_KEY_SECRET
          ? { keyId: raw.RAZORPAY_KEY_ID, keySecret: raw.RAZORPAY_KEY_SECRET }
          : undefined,
    },
    ai: {
      apiKey: raw.AI_API_KEY,
      model: raw.AI_MODEL,
    },
  };
}
