import { describe, expect, it } from "vitest";
import { loadConfig } from "./load.js";
import { ConfigValidationError } from "./errors.js";

const BASE_ENV = {
  NODE_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  PAYMENT_PROVIDER: "simulator",
} as unknown as NodeJS.ProcessEnv;

describe("loadConfig", () => {
  it("succeeds in development with only the simulator provider configured", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.isProduction).toBe(false);
    expect(config.payments.provider).toBe("simulator");
    expect(config.payments.razorpay).toBeUndefined();
  });

  it("defaults ai.provider to anthropic and ai.isConfigured to false with no AI credentials", () => {
    const config = loadConfig(BASE_ENV);
    expect(config.ai.provider).toBe("anthropic");
    expect(config.ai.isConfigured).toBe(false);
  });

  it("sets ai.isConfigured to true only once both AI_API_KEY and AI_MODEL are set", () => {
    const onlyKey = loadConfig({
      ...BASE_ENV,
      AI_API_KEY: "sk-test",
    } as unknown as NodeJS.ProcessEnv);
    expect(onlyKey.ai.isConfigured).toBe(false);

    const both = loadConfig({
      ...BASE_ENV,
      AI_API_KEY: "sk-test",
      AI_MODEL: "claude-sonnet-5",
    } as unknown as NodeJS.ProcessEnv);
    expect(both.ai.isConfigured).toBe(true);
  });

  it("throws when NODE_ENV=production and DATABASE_URL is missing", () => {
    const env = { ...BASE_ENV, NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });

  it("succeeds in production once DATABASE_URL and AI credentials are set", () => {
    const env = {
      ...BASE_ENV,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://localhost:5432/recoverai",
      AI_API_KEY: "sk-test",
      AI_MODEL: "test-model",
    } as unknown as NodeJS.ProcessEnv;
    const config = loadConfig(env);
    expect(config.isProduction).toBe(true);
    expect(config.database.url).toBe("postgres://localhost:5432/recoverai");
  });

  it("throws when PAYMENT_PROVIDER=razorpay without credentials", () => {
    const env = {
      ...BASE_ENV,
      PAYMENT_PROVIDER: "razorpay",
    } as unknown as NodeJS.ProcessEnv;
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });

  it("succeeds when PAYMENT_PROVIDER=razorpay with both credentials set", () => {
    const env = {
      ...BASE_ENV,
      PAYMENT_PROVIDER: "razorpay",
      RAZORPAY_KEY_ID: "rzp_test_id",
      RAZORPAY_KEY_SECRET: "rzp_test_secret",
    } as unknown as NodeJS.ProcessEnv;
    const config = loadConfig(env);
    expect(config.payments.razorpay).toEqual({
      keyId: "rzp_test_id",
      keySecret: "rzp_test_secret",
    });
  });
});
