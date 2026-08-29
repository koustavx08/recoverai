import { brand } from "@recoverai/core";
import type {
  ActorType,
  AuditEvent,
  AuditEventRepository,
  AuditEventType,
  ISODateString,
  MerchantId,
} from "@recoverai/core";
import type { AuditEvent as AuditEventRow, PrismaClient } from "@prisma/client";
import { decodeMetadata, encodeMetadata } from "./mappers.js";

function toDomain(row: AuditEventRow): AuditEvent {
  return {
    id: brand<string, "AuditEventId">(row.id),
    type: row.type as AuditEventType,
    merchantId: brand<string, "MerchantId">(row.merchantId),
    transactionId: row.transactionId
      ? brand<string, "TransactionId">(row.transactionId)
      : undefined,
    actorType: row.actorType as ActorType,
    actorId: row.actorId,
    summary: row.summary,
    data: decodeMetadata(row.data),
    occurredAt: row.occurredAt as ISODateString,
  };
}

/**
 * Audit events are append-only: this repository intentionally has no
 * update or delete operation, mirroring the immutability guarantee the
 * in-memory implementation provides.
 */
export class PrismaAuditEventRepository implements AuditEventRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByMerchant(merchantId: MerchantId): Promise<readonly AuditEvent[]> {
    const rows = await this.client.auditEvent.findMany({
      where: { merchantId },
      orderBy: { occurredAt: "asc" },
    });
    return rows.map(toDomain);
  }

  async append(event: AuditEvent): Promise<void> {
    await this.client.auditEvent.create({
      data: {
        id: event.id,
        type: event.type,
        merchantId: event.merchantId,
        transactionId: event.transactionId ?? null,
        actorType: event.actorType,
        actorId: event.actorId,
        summary: event.summary,
        data: encodeMetadata(event.data),
        occurredAt: event.occurredAt,
      },
    });
  }
}
