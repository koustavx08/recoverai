import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact-secrets.js";

describe("redactSecrets", () => {
  it("redacts an Anthropic-style API key", () => {
    const text = "Request failed: invalid key sk-ant-api03-abcDEF123456789xyz provided.";
    expect(redactSecrets(text)).toBe("Request failed: invalid key [REDACTED] provided.");
  });

  it("redacts a generic sk-prefixed key", () => {
    const text = "auth error for sk-1234567890abcdefghijklmnop";
    expect(redactSecrets(text)).toBe("auth error for [REDACTED]");
  });

  it("redacts a Bearer token", () => {
    const text = "rejected header Authorization: Bearer abcDEF123456.token-value";
    expect(redactSecrets(text)).toBe("rejected header Authorization: [REDACTED]");
  });

  it("leaves an ordinary error message untouched", () => {
    const text = 'Anthropic response for schema "diagnosis" did not include the expected tool call.';
    expect(redactSecrets(text)).toBe(text);
  });

  it("does not redact a normal transaction id or UUID", () => {
    const text = "failed for transaction txn_00002, execution 5712ba34-ff71-4a64-b9df-a22b90eb53d8";
    expect(redactSecrets(text)).toBe(text);
  });

  it("redacts an underscore-prefixed sk_ key (the Stripe-style shape)", () => {
    // Deliberately not shaped like a real Stripe key (no "live"/"test"
    // segment) — a realistic-looking one trips GitHub's push-protection
    // secret scanner on this very file, which only tests for the shape.
    const text = "payment failed using sk_notarealkeyABCDEFGHIJKLMNOP";
    expect(redactSecrets(text)).toBe("payment failed using [REDACTED]");
  });

  it("redacts an AWS access key id", () => {
    const text = "credentials rejected: AKIAIOSFODNN7EXAMPLE";
    expect(redactSecrets(text)).toBe("credentials rejected: [REDACTED]");
  });

  it("redacts a GitHub personal access token", () => {
    const text = "clone failed with ghp_1234567890abcdefghijklmnopqrstuvwx";
    expect(redactSecrets(text)).toBe("clone failed with [REDACTED]");
  });

  it("redacts a Slack-shaped token", () => {
    // Deliberately not the exact digit-group Slack format — same reason
    // as the sk_ test above.
    const text = "webhook rejected xoxb-notarealtoken-abcdefghijklmnop";
    expect(redactSecrets(text)).toBe("webhook rejected [REDACTED]");
  });

  it("redacts a JWT", () => {
    const text = "session invalid: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(redactSecrets(text)).toBe("session invalid: [REDACTED]");
  });

  it("redacts a labeled credential assignment", () => {
    expect(redactSecrets('config error: api_key: "abcd1234efgh5678"')).toBe("config error: [REDACTED]");
    expect(redactSecrets("login failed, password=hunter2xyzsecret")).toBe("login failed, [REDACTED]");
  });

  it("does not redact 'Authorization:' merely for containing the word 'auth'", () => {
    const text = "rejected header Authorization: missing";
    expect(redactSecrets(text)).toBe(text);
  });
});
