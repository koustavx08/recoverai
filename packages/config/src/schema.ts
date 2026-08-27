import { z } from "zod";

/**
 * Raw environment variable schema. Everything is optional at this layer —
 * cross-field requirements (e.g. "DATABASE_URL is required in production")
 * are enforced in `load.ts` via `superRefine`, so callers get one clear
 * error message instead of a wall of "expected string, received undefined".
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1).optional(),

  PAYMENT_PROVIDER: z.enum(["simulator", "razorpay"]).default("simulator"),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),

  AI_PROVIDER: z.enum(["anthropic"]).default("anthropic"),
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
});

export type RawEnv = z.infer<typeof envSchema>;
