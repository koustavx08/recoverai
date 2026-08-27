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
});
