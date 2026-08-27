/**
 * Redacts substrings that look like API keys/tokens from free-form text
 * before it is ever persisted (as a `Diagnosis`/`StrategyDecision`
 * `fallbackReason`) or rendered on the dashboard.
 *
 * This exists because `GroundedDiagnosisAgent`/`GroundedStrategyAgent`
 * store the raw `Error.message` from a failed AI provider call as their
 * fallback reason, and that message did not originate from this
 * codebase — it comes from the Anthropic SDK (or any future
 * `AIModelProvider`), which offers no contractual guarantee that its
 * error messages never echo request details. Defense in depth: even if a
 * provider's SDK ever included a key or bearer token in an error message,
 * it must not reach the audit trail or the UI unredacted.
 */
// Deliberately narrow and credential-shaped only — a broad "any long
// alphanumeric run" pattern would also redact legitimate identifiers
// (transaction ids, UUIDs, model names) that a real fallback reason
// should keep, defeating its purpose as an audit/debugging trail.
const SECRET_PATTERNS: readonly RegExp[] = [
  // Anthropic API keys: "sk-ant-" followed by key material.
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  // Generic "sk-"-prefixed keys (OpenAI-style and similar).
  /sk-[A-Za-z0-9_-]{20,}/g,
  // Bearer tokens in an Authorization-header-shaped string.
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), text);
}
