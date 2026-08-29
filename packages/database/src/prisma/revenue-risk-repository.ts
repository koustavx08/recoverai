import { brand } from "@recoverai/core";
import type {
  FailureReasonCode,
  FailureSeverity,
  ISODateString,
  RecoveryStrategyType,
  RevenueRisk,
  RevenueRiskRepository,
  RiskPriority,
  TransactionId,
} from "@recoverai/core";
import type { RevenueRisk as RevenueRiskRow, PrismaClient } from "@prisma/client";
import { decodeStringArray, encodeStringArray } from "./mappers.js";

function toDomain(row: RevenueRiskRow): RevenueRisk {
  return {
    transactionId: brand<string, "TransactionId">(row.transactionId),
    riskScore: row.riskScore,
    recoverabilityScore: row.recoverabilityScore,
    expectedRecoveryAmount: {
      amount: row.expectedRecoveryAmount,
      currency: row.expectedRecoveryCurrency,
    },
    failureReason: {
      code: row.failureReasonCode as FailureReasonCode,
      description: row.failureReasonDescription,
      recoverable: row.failureReasonRecoverable,
      severity: row.failureReasonSeverity as FailureSeverity,
      confidence: row.failureReasonConfidence,
      evidence: decodeStringArray(row.failureReasonEvidence),
    },
    priority: row.priority as RiskPriority,
    recommendedStrategy: row.recommendedStrategy as RecoveryStrategyType,
    explanation: row.explanation,
    assessedAt: row.assessedAt as ISODateString,
  };
}

export class PrismaRevenueRiskRepository implements RevenueRiskRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByTransaction(transactionId: TransactionId): Promise<RevenueRisk | null> {
    const row = await this.client.revenueRisk.findUnique({ where: { transactionId } });
    return row ? toDomain(row) : null;
  }

  async save(risk: RevenueRisk): Promise<void> {
    const data = {
      riskScore: risk.riskScore,
      recoverabilityScore: risk.recoverabilityScore,
      expectedRecoveryAmount: risk.expectedRecoveryAmount.amount,
      expectedRecoveryCurrency: risk.expectedRecoveryAmount.currency,
      failureReasonCode: risk.failureReason.code,
      failureReasonDescription: risk.failureReason.description,
      failureReasonRecoverable: risk.failureReason.recoverable,
      failureReasonSeverity: risk.failureReason.severity,
      failureReasonConfidence: risk.failureReason.confidence,
      failureReasonEvidence: encodeStringArray(risk.failureReason.evidence),
      priority: risk.priority,
      recommendedStrategy: risk.recommendedStrategy,
      explanation: risk.explanation,
      assessedAt: risk.assessedAt,
    };
    await this.client.revenueRisk.upsert({
      where: { transactionId: risk.transactionId },
      create: { transactionId: risk.transactionId, ...data },
      update: data,
    });
  }
}
