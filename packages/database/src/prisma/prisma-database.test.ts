import { afterAll, describe, expect, it } from "vitest";
import { brand, type ISODateString } from "@recoverai/core";
import { createPrismaDatabase } from "../database.js";
import { disconnectPrismaClient, getPrismaClient } from "./client.js";

function iso(s: string): ISODateString {
  return brand<string, "ISODateString">(s);
}

/**
 * Exercises every Prisma repository against the real (dev) SQLite file —
 * `pnpm db:migrate` must have been run first so the schema exists. Every
 * row this suite writes is prefixed `prisma_test_` and removed in
 * `afterAll`, so it's safe to run against the same file the CLI/dashboard
 * use without leaving residue.
 */
describe("createPrismaDatabase", () => {
  const db = createPrismaDatabase();

  const transactionId = brand<string, "TransactionId">("prisma_test_txn_1");
  const merchantId = brand<string, "MerchantId">("prisma_test_mer_1");
  const customerId = brand<string, "CustomerId">("prisma_test_cus_1");
  const recoveryActionId = brand<string, "RecoveryActionId">("prisma_test_action_1");
  const auditEventId = brand<string, "AuditEventId">("prisma_test_audit_1");

  afterAll(async () => {
    const client = getPrismaClient();
    await client.auditEvent.deleteMany({ where: { id: auditEventId } });
    await client.recoveryAction.deleteMany({ where: { id: recoveryActionId } });
    await client.revenueRisk.deleteMany({ where: { transactionId } });
    await client.paymentAttempt.deleteMany({ where: { transactionId } });
    await client.transaction.deleteMany({ where: { id: transactionId } });
    await client.customer.deleteMany({ where: { id: customerId } });
    await client.merchant.deleteMany({ where: { id: merchantId } });
    await disconnectPrismaClient();
  });

  it("round-trips a merchant", async () => {
    await db.merchants.save({
      id: merchantId,
      name: "Test Merchant",
      email: "merchant@example.com",
      defaultCurrency: "INR",
      createdAt: iso("2026-01-01T00:00:00.000Z"),
      metadata: { plan: "pro" },
    });

    const found = await db.merchants.findById(merchantId);
    expect(found).toEqual({
      id: merchantId,
      name: "Test Merchant",
      email: "merchant@example.com",
      defaultCurrency: "INR",
      createdAt: iso("2026-01-01T00:00:00.000Z"),
      metadata: { plan: "pro" },
    });
  });

  it("round-trips a customer", async () => {
    await db.customers.save({
      id: customerId,
      merchantId,
      email: "customer@example.com",
      createdAt: iso("2026-01-01T00:00:00.000Z"),
    });

    const found = await db.customers.findById(customerId);
    expect(found?.email).toBe("customer@example.com");
    expect(found?.merchantId).toBe(merchantId);
  });

  it("round-trips a transaction with ordered payment attempts, then re-saves with fewer attempts", async () => {
    await db.transactions.save({
      id: transactionId,
      merchantId,
      customerId,
      amount: { amount: 50_000, currency: "INR" },
      status: "failed",
      paymentMethod: "card",
      attempts: [
        {
          id: brand("prisma_test_attempt_1"),
          transactionId,
          status: "failed",
          paymentMethod: "card",
          failureReasonCode: "insufficient_funds",
          attemptedAt: iso("2026-01-01T00:00:00.000Z"),
        },
        {
          id: brand("prisma_test_attempt_2"),
          transactionId,
          status: "failed",
          paymentMethod: "upi",
          failureReasonCode: "upi_failure",
          attemptedAt: iso("2026-01-01T01:00:00.000Z"),
        },
      ],
      createdAt: iso("2026-01-01T00:00:00.000Z"),
      updatedAt: iso("2026-01-01T01:00:00.000Z"),
    });

    const found = await db.transactions.findById(transactionId);
    expect(found?.attempts.map((a) => a.id)).toEqual([
      "prisma_test_attempt_1",
      "prisma_test_attempt_2",
    ]);
    expect(found?.attempts[1]?.failureReasonCode).toBe("upi_failure");

    const byMerchant = await db.transactions.findByMerchant(merchantId);
    expect(byMerchant.some((t) => t.id === transactionId)).toBe(true);

    // Re-saving with a shorter attempts array must not leave stale rows behind.
    await db.transactions.save({
      id: transactionId,
      merchantId,
      customerId,
      amount: { amount: 50_000, currency: "INR" },
      status: "succeeded",
      paymentMethod: "card",
      attempts: [
        {
          id: brand("prisma_test_attempt_3"),
          transactionId,
          status: "succeeded",
          paymentMethod: "card",
          attemptedAt: iso("2026-01-01T02:00:00.000Z"),
        },
      ],
      createdAt: iso("2026-01-01T00:00:00.000Z"),
      updatedAt: iso("2026-01-01T02:00:00.000Z"),
    });

    const updated = await db.transactions.findById(transactionId);
    expect(updated?.status).toBe("succeeded");
    expect(updated?.attempts).toHaveLength(1);
    expect(updated?.attempts[0]?.id).toBe("prisma_test_attempt_3");
  });

  it("round-trips a revenue risk assessment", async () => {
    await db.revenueRisks.save({
      transactionId,
      riskScore: 72.5,
      recoverabilityScore: 61,
      expectedRecoveryAmount: { amount: 40_000, currency: "INR" },
      failureReason: {
        code: "insufficient_funds",
        description: "Card had insufficient funds.",
        recoverable: true,
        severity: "medium",
        confidence: 0.9,
        evidence: ["decline_code=51", "prior_success_on_retry"],
      },
      priority: "high",
      recommendedStrategy: "retry_payment",
      explanation: "Retry after payday.",
      assessedAt: iso("2026-01-01T02:00:00.000Z"),
    });

    const found = await db.revenueRisks.findByTransaction(transactionId);
    expect(found?.failureReason.evidence).toEqual([
      "decline_code=51",
      "prior_success_on_retry",
    ]);
    expect(found?.riskScore).toBe(72.5);
  });

  it("round-trips a recovery action", async () => {
    await db.recoveryActions.save({
      id: recoveryActionId,
      transactionId,
      type: "auto_retry",
      strategy: "retry_payment",
      status: "succeeded",
      executedAt: iso("2026-01-01T03:00:00.000Z"),
      metadata: { simulationMode: true },
    });

    const found = await db.recoveryActions.findById(recoveryActionId);
    expect(found?.status).toBe("succeeded");
    expect(found?.metadata).toEqual({ simulationMode: true });

    const byTransaction = await db.recoveryActions.findByTransaction(transactionId);
    expect(byTransaction).toHaveLength(1);
  });

  it("appends (but never mutates) an audit event", async () => {
    await db.auditEvents.append({
      id: auditEventId,
      type: "recovery_action_executed",
      merchantId,
      transactionId,
      actorType: "agent",
      actorId: "simulated-recovery-agent",
      summary: "Simulated retry succeeded.",
      occurredAt: iso("2026-01-01T03:00:00.000Z"),
    });

    const found = await db.auditEvents.findByMerchant(merchantId);
    expect(found.some((e) => e.id === auditEventId)).toBe(true);
    expect(typeof (db.auditEvents as { update?: unknown }).update).toBe("undefined");
  });

  it("persists across independently created Database handles (same process)", async () => {
    const otherHandle = createPrismaDatabase();
    const found = await otherHandle.transactions.findById(transactionId);
    expect(found?.id).toBe(transactionId);
  });
});
