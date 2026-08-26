import type {
  AuditEventRepository,
  CustomerRepository,
  MerchantRepository,
  RecoveryActionRepository,
  RevenueRiskRepository,
  TransactionRepository,
} from "@recoverai/core";
import {
  InMemoryAuditEventRepository,
  InMemoryCustomerRepository,
  InMemoryMerchantRepository,
  InMemoryRecoveryActionRepository,
  InMemoryRevenueRiskRepository,
  InMemoryTransactionRepository,
} from "./in-memory/index.js";

/** Aggregate handle to every repository RecoverAI needs. */
export interface Database {
  readonly transactions: TransactionRepository;
  readonly customers: CustomerRepository;
  readonly merchants: MerchantRepository;
  readonly revenueRisks: RevenueRiskRepository;
  readonly recoveryActions: RecoveryActionRepository;
  readonly auditEvents: AuditEventRepository;
}

/**
 * In-memory `Database` implementation. This is the only backing store
 * implemented so far — sufficient for local development, the CLI, and
 * tests. A real backend (e.g. Postgres via Prisma or Drizzle) should
 * implement the same `Database` shape without requiring changes to any
 * caller.
 */
export function createInMemoryDatabase(): Database {
  return {
    transactions: new InMemoryTransactionRepository(),
    customers: new InMemoryCustomerRepository(),
    merchants: new InMemoryMerchantRepository(),
    revenueRisks: new InMemoryRevenueRiskRepository(),
    recoveryActions: new InMemoryRecoveryActionRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
  };
}
