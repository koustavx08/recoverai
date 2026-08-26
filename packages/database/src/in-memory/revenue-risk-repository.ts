import type { RevenueRisk, RevenueRiskRepository, TransactionId } from "@recoverai/core";

export class InMemoryRevenueRiskRepository implements RevenueRiskRepository {
  private readonly byTransactionId = new Map<TransactionId, RevenueRisk>();

  async findByTransaction(transactionId: TransactionId): Promise<RevenueRisk | null> {
    return this.byTransactionId.get(transactionId) ?? null;
  }

  async save(risk: RevenueRisk): Promise<void> {
    this.byTransactionId.set(risk.transactionId, risk);
  }
}
