import { brand } from "@recoverai/core";
import type {
  ISODateString,
  MerchantId,
  PaymentAttempt,
  PaymentMethod,
  PaymentAttemptId,
  PaymentAttemptStatus,
  FailureReasonCode,
  Transaction,
  TransactionId,
  TransactionRepository,
  TransactionStatus,
} from "@recoverai/core";
import type { PaymentAttempt as PaymentAttemptRow, Transaction as TransactionRow, PrismaClient } from "@prisma/client";
import { decodeMetadata, encodeMetadata } from "./mappers.js";

type TransactionWithAttempts = TransactionRow & { attempts: PaymentAttemptRow[] };

function toDomainAttempt(row: PaymentAttemptRow): PaymentAttempt {
  return {
    id: brand<string, "PaymentAttemptId">(row.id) as PaymentAttemptId,
    transactionId: brand<string, "TransactionId">(row.transactionId) as TransactionId,
    status: row.status as PaymentAttemptStatus,
    paymentMethod: row.paymentMethod as PaymentMethod,
    failureReasonCode: (row.failureReasonCode as FailureReasonCode | null) ?? undefined,
    providerErrorMessage: row.providerErrorMessage ?? undefined,
    attemptedAt: row.attemptedAt as ISODateString,
  };
}

function toDomainTransaction(row: TransactionWithAttempts): Transaction {
  return {
    id: brand<string, "TransactionId">(row.id) as TransactionId,
    merchantId: brand<string, "MerchantId">(row.merchantId) as MerchantId,
    customerId: brand<string, "CustomerId">(row.customerId) as Transaction["customerId"],
    amount: { amount: row.amount, currency: row.currency },
    status: row.status as TransactionStatus,
    paymentMethod: row.paymentMethod as PaymentMethod,
    attempts: [...row.attempts]
      .sort((a, b) => a.sequence - b.sequence)
      .map(toDomainAttempt),
    createdAt: row.createdAt as ISODateString,
    updatedAt: row.updatedAt as ISODateString,
    metadata: decodeMetadata(row.metadata),
  };
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly client: PrismaClient) {}

  async findById(id: TransactionId): Promise<Transaction | null> {
    const row = await this.client.transaction.findUnique({
      where: { id },
      include: { attempts: true },
    });
    return row ? toDomainTransaction(row) : null;
  }

  async findByMerchant(merchantId: MerchantId): Promise<readonly Transaction[]> {
    const rows = await this.client.transaction.findMany({
      where: { merchantId },
      include: { attempts: true },
    });
    return rows.map(toDomainTransaction);
  }

  async findAll(): Promise<readonly Transaction[]> {
    const rows = await this.client.transaction.findMany({ include: { attempts: true } });
    return rows.map(toDomainTransaction);
  }

  async save(transaction: Transaction): Promise<void> {
    const data = {
      merchantId: transaction.merchantId,
      customerId: transaction.customerId,
      amount: transaction.amount.amount,
      currency: transaction.amount.currency,
      status: transaction.status,
      paymentMethod: transaction.paymentMethod,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      metadata: encodeMetadata(transaction.metadata),
    };

    await this.client.$transaction(async (tx) => {
      await tx.transaction.upsert({
        where: { id: transaction.id },
        create: { id: transaction.id, ...data },
        update: data,
      });

      await tx.paymentAttempt.deleteMany({ where: { transactionId: transaction.id } });

      if (transaction.attempts.length > 0) {
        await tx.paymentAttempt.createMany({
          data: transaction.attempts.map((attempt, sequence) => ({
            id: attempt.id,
            transactionId: transaction.id,
            sequence,
            status: attempt.status,
            paymentMethod: attempt.paymentMethod,
            failureReasonCode: attempt.failureReasonCode ?? null,
            providerErrorMessage: attempt.providerErrorMessage ?? null,
            attemptedAt: attempt.attemptedAt,
          })),
        });
      }
    });
  }
}
