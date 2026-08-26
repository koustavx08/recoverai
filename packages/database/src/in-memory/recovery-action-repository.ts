import type {
  RecoveryAction,
  RecoveryActionId,
  RecoveryActionRepository,
  TransactionId,
} from "@recoverai/core";

export class InMemoryRecoveryActionRepository implements RecoveryActionRepository {
  private readonly byId = new Map<RecoveryActionId, RecoveryAction>();

  async findById(id: RecoveryActionId): Promise<RecoveryAction | null> {
    return this.byId.get(id) ?? null;
  }

  async findByTransaction(
    transactionId: TransactionId,
  ): Promise<readonly RecoveryAction[]> {
    return [...this.byId.values()].filter(
      (action) => action.transactionId === transactionId,
    );
  }

  async save(action: RecoveryAction): Promise<void> {
    this.byId.set(action.id, action);
  }
}
