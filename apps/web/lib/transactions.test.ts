import { describe, expect, it } from "vitest";
import { brand, type MerchantId } from "@recoverai/core";
import { isDrillDownEligible, loadTransactionList } from "./transactions";

const AURORA: MerchantId = brand<string, "MerchantId">("mer_aurora_retail");
const NORTHWIND: MerchantId = brand<string, "MerchantId">("mer_northwind_saas");

describe("loadTransactionList", () => {
  it("returns every ingested transaction for the given merchant when no filter is given", async () => {
    const view = await loadTransactionList(AURORA);
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.transactions).toHaveLength(view.total);
    expect(view.total).toBeGreaterThan(0);
  });

  it("filters to exactly one status when given", async () => {
    const view = await loadTransactionList(AURORA, "failed");
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.transactions.length).toBeGreaterThan(0);
    for (const transaction of view.transactions) {
      expect(transaction.status).toBe("failed");
    }
    // total always reflects the whole dataset, not the filtered subset.
    expect(view.total).toBeGreaterThanOrEqual(view.transactions.length);
  });

  it("statusCounts sums to the dataset total regardless of filter", async () => {
    const view = await loadTransactionList(AURORA, "succeeded");
    expect(view).not.toBeNull();
    if (!view) return;

    const sum = Object.values(view.statusCounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(view.total);
  });

  it("sorts newest first", async () => {
    const view = await loadTransactionList(AURORA);
    expect(view).not.toBeNull();
    if (!view) return;

    for (let i = 1; i < view.transactions.length; i++) {
      expect(view.transactions[i - 1]!.createdAt >= view.transactions[i]!.createdAt).toBe(true);
    }
  });

  it("scopes results to the requested merchant — no cross-merchant leakage", async () => {
    const auroraView = await loadTransactionList(AURORA);
    const northwindView = await loadTransactionList(NORTHWIND);
    expect(auroraView).not.toBeNull();
    expect(northwindView).not.toBeNull();
    if (!auroraView || !northwindView) return;

    for (const transaction of auroraView.transactions) expect(transaction.merchantId).toBe(AURORA);
    for (const transaction of northwindView.transactions) expect(transaction.merchantId).toBe(NORTHWIND);

    const auroraIds = new Set(auroraView.transactions.map((t) => t.id));
    const northwindIds = new Set(northwindView.transactions.map((t) => t.id));
    for (const id of auroraIds) expect(northwindIds.has(id)).toBe(false);
  });
});

describe("isDrillDownEligible", () => {
  it("is true only for failed and abandoned transactions", () => {
    expect(isDrillDownEligible("failed")).toBe(true);
    expect(isDrillDownEligible("abandoned")).toBe(true);
    expect(isDrillDownEligible("succeeded")).toBe(false);
    expect(isDrillDownEligible("pending")).toBe(false);
    expect(isDrillDownEligible("refunded")).toBe(false);
  });
});
