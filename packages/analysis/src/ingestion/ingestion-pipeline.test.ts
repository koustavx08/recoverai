import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TransactionRepository } from "@recoverai/core";
import { ingestFile } from "./ingestion-pipeline.js";

function fakeRepository(): TransactionRepository & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    async findById() {
      return null;
    },
    async findByMerchant() {
      return [];
    },
    async findAll() {
      return [];
    },
    async save(transaction) {
      saved.push(transaction);
    },
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "recoverai-ingest-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ingestFile", () => {
  it("ingests the bundled rich JSON sample dataset cleanly", async () => {
    const repository = fakeRepository();
    const { summary, transactions } = await ingestFile({
      filePath: "data/samples/transactions.json",
      repository,
    });

    expect(summary.format).toBe("json");
    expect(summary.totalRecords).toBe(12);
    expect(summary.validRecords).toBe(12);
    expect(summary.invalidRecords).toBe(0);
    expect(transactions).toHaveLength(12);
    expect(repository.saved).toHaveLength(12);
  });

  it("ingests the bundled flat CSV sample dataset cleanly", async () => {
    const repository = fakeRepository();
    const { summary } = await ingestFile({
      filePath: "data/samples/transactions.csv",
      repository,
    });

    expect(summary.format).toBe("csv");
    expect(summary.totalRecords).toBe(10);
    expect(summary.validRecords).toBe(10);
    expect(summary.invalidRecords).toBe(0);
  });

  it("rejects a record with a missing required field, with a useful error", async () => {
    const filePath = join(dir, "bad.json");
    writeFileSync(
      filePath,
      JSON.stringify([
        {
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: 100, currency: "INR" },
          status: "failed",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );

    const { summary } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(summary.validRecords).toBe(0);
    expect(summary.invalidRecords).toBe(1);
    expect(summary.issues[0]!.reason).toMatch(/id/);
  });

  it("rejects a record with a negative amount", async () => {
    const filePath = join(dir, "bad-amount.json");
    writeFileSync(
      filePath,
      JSON.stringify([
        {
          id: "t1",
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: -1, currency: "INR" },
          status: "failed",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );

    const { summary } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(summary.invalidRecords).toBe(1);
    expect(summary.issues[0]!.reason).toMatch(/negative/);
  });

  it("rejects a record with an invalid currency code", async () => {
    const filePath = join(dir, "bad-currency.json");
    writeFileSync(
      filePath,
      JSON.stringify([
        {
          id: "t1",
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: 100, currency: "rupees" },
          status: "failed",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );

    const { summary } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(summary.invalidRecords).toBe(1);
    expect(summary.issues[0]!.reason).toMatch(/3-letter ISO 4217/);
  });

  it("rejects a record whose transaction id duplicates an earlier one in the same file", async () => {
    const filePath = join(dir, "dup.json");
    const record = (id: string) => ({
      id,
      merchantId: "m1",
      customerId: "c1",
      amount: { amount: 100, currency: "INR" },
      status: "succeeded",
      paymentMethod: "card",
      attempts: [],
      createdAt: "2025-01-01T00:00:00.000Z",
    });
    writeFileSync(filePath, JSON.stringify([record("dup_1"), record("dup_1")]));

    const { summary } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(summary.validRecords).toBe(1);
    expect(summary.invalidRecords).toBe(1);
    expect(summary.issues[0]!.reason).toMatch(/duplicate transaction id/);
  });

  it("continues past malformed records instead of aborting the whole batch", async () => {
    const filePath = join(dir, "mixed.json");
    writeFileSync(
      filePath,
      JSON.stringify([
        {
          id: "ok_1",
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: 100, currency: "INR" },
          status: "succeeded",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: 100, currency: "INR" },
          status: "succeeded",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
        {
          id: "ok_2",
          merchantId: "m1",
          customerId: "c1",
          amount: { amount: 200, currency: "INR" },
          status: "succeeded",
          paymentMethod: "card",
          attempts: [],
          createdAt: "2025-01-01T00:00:00.000Z",
        },
      ]),
    );

    const { summary } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(summary.totalRecords).toBe(3);
    expect(summary.validRecords).toBe(2);
    expect(summary.invalidRecords).toBe(1);
  });

  it("parses a flat CSV row and normalizes an omitted failureReasonCode/attemptCount sensibly", async () => {
    const filePath = join(dir, "flat.csv");
    writeFileSync(
      filePath,
      "id,merchantId,customerId,amount,currency,status,paymentMethod,createdAt\ncsv_1,m1,c1,50000,INR,succeeded,card,2025-01-01T00:00:00.000Z\n",
    );

    const { transactions } = await ingestFile({ filePath, repository: fakeRepository() });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.attemptCount).toBe(1);
    expect(transactions[0]!.amount).toEqual({ amount: 50000, currency: "INR" });
  });
});
