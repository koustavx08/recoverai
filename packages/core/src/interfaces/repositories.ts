import type {
  CustomerId,
  MerchantId,
  RecoveryActionId,
  TransactionId,
} from "../types/common.js";
import type { AuditEvent } from "../domain/audit-event.js";
import type { Customer } from "../domain/customer.js";
import type { Merchant } from "../domain/merchant.js";
import type { RecoveryAction } from "../domain/recovery.js";
import type { RevenueRisk } from "../domain/revenue-risk.js";
import type { Transaction } from "../domain/transaction.js";

/**
 * Persistence ports the domain layer depends on. Concrete implementations
 * (Postgres, SQLite, in-memory, ...) live in packages/database and must
 * never be imported directly by core, agents, or the CLI command layer.
 */
export interface TransactionRepository {
  findById(id: TransactionId): Promise<Transaction | null>;
  findByMerchant(merchantId: MerchantId): Promise<readonly Transaction[]>;
  /** Every transaction in the store, across merchants — used by batch analysis, which is not merchant-scoped. */
  findAll(): Promise<readonly Transaction[]>;
  save(transaction: Transaction): Promise<void>;
}

export interface CustomerRepository {
  findById(id: CustomerId): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}

export interface MerchantRepository {
  findById(id: MerchantId): Promise<Merchant | null>;
  save(merchant: Merchant): Promise<void>;
}

export interface RevenueRiskRepository {
  findByTransaction(transactionId: TransactionId): Promise<RevenueRisk | null>;
  save(risk: RevenueRisk): Promise<void>;
}

export interface RecoveryActionRepository {
  findById(id: RecoveryActionId): Promise<RecoveryAction | null>;
  findByTransaction(transactionId: TransactionId): Promise<readonly RecoveryAction[]>;
  save(action: RecoveryAction): Promise<void>;
}

export interface AuditEventRepository {
  findByMerchant(merchantId: MerchantId): Promise<readonly AuditEvent[]>;
  append(event: AuditEvent): Promise<void>;
}
