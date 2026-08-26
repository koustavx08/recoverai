import type {
  TransactionId,
  RecoveryActionId,
  Money,
  Metadata,
  ISODateString,
} from "../types/common.js";
import type {
  RecoveryStrategyType,
  RecoveryActionType,
  RecoveryActionStatus,
} from "../types/enums.js";

/** A named approach for attempting to recover an at-risk transaction. */
export interface RecoveryStrategy {
  readonly type: RecoveryStrategyType;
  /** Human-readable label, e.g. "Retry payment via original method". */
  readonly label: string;
  readonly description: string;
  /** Relative confidence (0–1) that this strategy will succeed, if known. */
  readonly confidence?: number;
}

/** A concrete, executable step derived from a RecoveryStrategy. */
export interface RecoveryAction {
  readonly id: RecoveryActionId;
  readonly transactionId: TransactionId;
  readonly type: RecoveryActionType;
  readonly strategy: RecoveryStrategyType;
  readonly status: RecoveryActionStatus;
  readonly scheduledAt?: ISODateString;
  readonly executedAt?: ISODateString;
  readonly metadata?: Metadata;
}

/** The outcome of executing (and verifying) a RecoveryAction. */
export interface RecoveryResult {
  readonly actionId: RecoveryActionId;
  readonly transactionId: TransactionId;
  readonly succeeded: boolean;
  /** Amount actually recovered, if any. Absent while unverified. */
  readonly recoveredAmount?: Money;
  readonly verifiedAt?: ISODateString;
  /** Free-text notes, e.g. provider response summary or failure detail. */
  readonly notes?: string;
}
