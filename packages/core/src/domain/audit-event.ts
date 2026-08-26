import type {
  AuditEventId,
  MerchantId,
  TransactionId,
  Metadata,
  ISODateString,
} from "../types/common.js";
import type { AuditEventType, ActorType } from "../types/enums.js";

/**
 * An immutable record in RecoverAI's audit trail. Every state-changing
 * operation the system performs — ingestion, risk assessment, strategy
 * selection, recovery execution, verification — must produce one of these.
 */
export interface AuditEvent {
  readonly id: AuditEventId;
  readonly type: AuditEventType;
  readonly merchantId: MerchantId;
  readonly transactionId?: TransactionId;
  readonly actorType: ActorType;
  /** Identifier of the actor, e.g. a user id, agent id, or "system". */
  readonly actorId: string;
  readonly summary: string;
  readonly data?: Metadata;
  readonly occurredAt: ISODateString;
}
