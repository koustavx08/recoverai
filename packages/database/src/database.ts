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
import {
  getPrismaClient,
  PrismaAuditEventRepository,
  PrismaCustomerRepository,
  PrismaMerchantRepository,
  PrismaRecoveryActionRepository,
  PrismaRevenueRiskRepository,
  PrismaTransactionRepository,
} from "./prisma/index.js";

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
 * In-memory `Database` implementation — a fresh, throwaway store on every
 * call. Used by tests and by callers that deliberately want an isolated,
 * self-contained run (e.g. the web dashboard's demo scenarios) rather than
 * durable state. See `createPrismaDatabase()` for the persistent backend.
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

/**
 * SQLite-backed (via Prisma) `Database` implementation — the persistent
 * backend. Every call reuses the same underlying `PrismaClient` connection
 * within a process (see `getPrismaClient()`), so data written by one call
 * is immediately visible to another, and — because the client always
 * points at the same on-disk file by default — visible across separate CLI
 * invocations too. Swapping to Postgres later only requires changing
 * `DATABASE_URL` and `prisma/schema.prisma`'s `datasource` provider; no
 * caller of `Database` needs to change.
 */
export function createPrismaDatabase(): Database {
  const client = getPrismaClient();
  return {
    transactions: new PrismaTransactionRepository(client),
    customers: new PrismaCustomerRepository(client),
    merchants: new PrismaMerchantRepository(client),
    revenueRisks: new PrismaRevenueRiskRepository(client),
    recoveryActions: new PrismaRecoveryActionRepository(client),
    auditEvents: new PrismaAuditEventRepository(client),
  };
}
