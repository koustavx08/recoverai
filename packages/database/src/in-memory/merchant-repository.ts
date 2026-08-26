import type { Merchant, MerchantId, MerchantRepository } from "@recoverai/core";

export class InMemoryMerchantRepository implements MerchantRepository {
  private readonly byId = new Map<MerchantId, Merchant>();

  async findById(id: MerchantId): Promise<Merchant | null> {
    return this.byId.get(id) ?? null;
  }

  async save(merchant: Merchant): Promise<void> {
    this.byId.set(merchant.id, merchant);
  }
}
