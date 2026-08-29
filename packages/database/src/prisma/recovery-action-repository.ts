import { brand } from "@recoverai/core";
import type {
  ISODateString,
  RecoveryAction,
  RecoveryActionId,
  RecoveryActionRepository,
  RecoveryActionStatus,
  RecoveryActionType,
  RecoveryStrategyType,
  TransactionId,
} from "@recoverai/core";
import type { RecoveryAction as RecoveryActionRow, PrismaClient } from "@prisma/client";
import { decodeMetadata, encodeMetadata } from "./mappers.js";

function toDomain(row: RecoveryActionRow): RecoveryAction {
  return {
    id: brand<string, "RecoveryActionId">(row.id),
    transactionId: brand<string, "TransactionId">(row.transactionId),
    type: row.type as RecoveryActionType,
    strategy: row.strategy as RecoveryStrategyType,
    status: row.status as RecoveryActionStatus,
    scheduledAt: (row.scheduledAt as ISODateString | null) ?? undefined,
    executedAt: (row.executedAt as ISODateString | null) ?? undefined,
    metadata: decodeMetadata(row.metadata),
  };
}

export class PrismaRecoveryActionRepository implements RecoveryActionRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: RecoveryActionId): Promise<RecoveryAction | null> {
    const row = await this.client.recoveryAction.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByTransaction(transactionId: TransactionId): Promise<readonly RecoveryAction[]> {
    const rows = await this.client.recoveryAction.findMany({ where: { transactionId } });
    return rows.map(toDomain);
  }

  async save(action: RecoveryAction): Promise<void> {
    const data = {
      transactionId: action.transactionId,
      type: action.type,
      strategy: action.strategy,
      status: action.status,
      scheduledAt: action.scheduledAt ?? null,
      executedAt: action.executedAt ?? null,
      metadata: encodeMetadata(action.metadata),
    };
    await this.client.recoveryAction.upsert({
      where: { id: action.id },
      create: { id: action.id, ...data },
      update: data,
    });
  }
}
