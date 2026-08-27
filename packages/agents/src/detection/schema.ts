import { z } from "zod";

/**
 * Bounded severity for a detection finding — never a free-form string.
 * `none` means "not a revenue-at-risk event at all" (e.g. a succeeded
 * transaction); the rest scale with how much is at stake and how urgent
 * the finding is.
 */
export const DETECTION_SEVERITIES = ["critical", "high", "medium", "low", "none"] as const;
export type DetectionSeverity = (typeof DETECTION_SEVERITIES)[number];
export const detectionSeveritySchema = z.enum(DETECTION_SEVERITIES);

/**
 * The bounded, structured output of the Detection stage — deterministic,
 * no model involved. `detected` means "this is a revenue-risk event worth
 * recording at all"; `actionable` means "the rest of the pipeline should
 * process it now" (a detected-but-non-actionable transaction — refunded,
 * non-retryable, retry limit reached — still gets recorded, just not
 * pursued further).
 */
export const detectionResultSchema = z.object({
  transactionId: z.string().min(1),
  detected: z.boolean(),
  actionable: z.boolean(),
  reason: z.string().min(1),
  severity: detectionSeveritySchema,
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type DetectionResult = z.infer<typeof detectionResultSchema>;
