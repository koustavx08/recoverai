import type { AuditEvent, AuditEventRepository, MerchantId } from "@recoverai/core";

/**
 * Audit events are append-only: this repository intentionally has no
 * update or delete operation, mirroring the immutability guarantee the
 * audit trail must provide in a real datastore.
 */
export class InMemoryAuditEventRepository implements AuditEventRepository {
  private readonly events: AuditEvent[] = [];

  async findByMerchant(merchantId: MerchantId): Promise<readonly AuditEvent[]> {
    return this.events.filter((event) => event.merchantId === merchantId);
  }

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
