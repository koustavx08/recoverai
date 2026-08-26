import type {
  MerchantId,
  Transaction,
  TransactionId,
  TransactionRepository,
} from "@recoverai/core";

export class InMemoryTransactionRepository implements TransactionRepository {
  private readonly byId = new Map<TransactionId, Transaction>();

  async findById(id: TransactionId): Promise<Transaction | null> {
    return this.byId.get(id) ?? null;
  }

  async findByMerchant(merchantId: MerchantId): Promise<readonly Transaction[]> {
    return [...this.byId.values()].filter((tx) => tx.merchantId === merchantId);
  }

  async findAll(): Promise<readonly Transaction[]> {
    return [...this.byId.values()];
  }

  async save(transaction: Transaction): Promise<void> {
    this.byId.set(transaction.id, transaction);
  }
}
