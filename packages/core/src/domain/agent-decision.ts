import type {
  AgentDecisionId,
  TransactionId,
  Metadata,
  ISODateString,
} from "../types/common.js";
import type { AgentDecisionStage } from "../types/enums.js";

/**
 * A single recorded decision made by an agent at some stage of the
 * detection → diagnosis → prioritization → strategy → recovery →
 * verification pipeline. Every agent decision is persisted so the full
 * reasoning chain behind a recovery outcome can be reconstructed later.
 */
export interface AgentDecision {
  readonly id: AgentDecisionId;
  readonly transactionId: TransactionId;
  readonly stage: AgentDecisionStage;
  /** Identifier of the agent implementation that produced this decision. */
  readonly agentId: string;
  /** Structured summary of what was decided, e.g. { strategy: "retry_payment" }. */
  readonly output: Metadata;
  /** Plain-language rationale for the decision, for audit/debugging. */
  readonly reasoning?: string;
  /** Model confidence in this decision, if applicable (0–1). */
  readonly confidence?: number;
  readonly decidedAt: ISODateString;
}
