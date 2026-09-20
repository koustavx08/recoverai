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
  // Generic "sk-"-prefixed keys (OpenAI-style and similar), including
  // Stripe-style "sk_live_"/"sk_test_" secret keys.
  /sk[_-][A-Za-z0-9_-]{14,}/g,
  // Bearer tokens in an Authorization-header-shaped string.
  /Bearer\s+[A-Za-z0-9._-]{10,}/gi,
  // AWS access key IDs.
  /AKIA[0-9A-Z]{16}/g,
  // GitHub personal access / OAuth / app tokens (ghp_, gho_, ghu_, ghs_, ghr_).
  /gh[oprsu]_[A-Za-z0-9]{20,}/g,
  // Slack tokens (xoxb-, xoxp-, xoxa-, xoxr-, xoxs-).
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  // Twilio Auth Tokens / Account SIDs are opaque 32-char hex strings and
  // too easily confused with ordinary ids on their own, so only redact
  // them when clearly labeled — see the "labeled credential assignment"
  // pattern below, which already covers that case.
  // JSON Web Tokens (three base64url segments separated by ".").
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
  // A value explicitly labeled as a credential in text, e.g.
  // `api_key: "abcd1234..."` or `password=hunter2xyz...` — deliberately
  // requires the label so this doesn't redact ordinary long identifiers
  // (transaction ids, UUIDs) that happen to appear near unrelated text.
  /(?:api[_-]?key|secret|token|password|auth)\s*[:=]\s*['"]?[A-Za-z0-9_\-.]{8,}['"]?/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), text);
}
