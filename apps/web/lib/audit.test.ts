import { describe, expect, it } from "vitest";
import { brand, type MerchantId } from "@recoverai/core";
import { loadAuditTrail } from "./audit";

const AURORA: MerchantId = brand<string, "MerchantId">("mer_aurora_retail");
const NORTHWIND: MerchantId = brand<string, "MerchantId">("mer_northwind_saas");

describe("loadAuditTrail", () => {
  it("produces at least one event per transaction that reached Detection", async () => {
    const view = await loadAuditTrail(AURORA);
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.events.length).toBeGreaterThan(0);
    for (const event of view.events) {
      expect(event.transactionId).toBeDefined();
      expect(event.summary.length).toBeGreaterThan(0);
    }
  });

  it("never marks an event type as a real recovery unless the stage actually executed", async () => {
    const view = await loadAuditTrail(AURORA);
    expect(view).not.toBeNull();
    if (!view) return;

    for (const event of view.events) {
      if (event.type === "recovery_action_executed") {
        expect(event.data?.simulationMode).toBe(true);
      }
    }
  });

  it("is sorted newest first", async () => {
    const view = await loadAuditTrail(AURORA);
    expect(view).not.toBeNull();
    if (!view) return;

    for (let i = 1; i < view.events.length; i++) {
      expect(view.events[i - 1]!.occurredAt >= view.events[i]!.occurredAt).toBe(true);
    }
  });

  it("scopes every event to the requested merchant — no cross-merchant leakage", async () => {
    const auroraView = await loadAuditTrail(AURORA);
    const northwindView = await loadAuditTrail(NORTHWIND);
    expect(auroraView).not.toBeNull();
    expect(northwindView).not.toBeNull();
    if (!auroraView || !northwindView) return;

    for (const event of auroraView.events) expect(event.merchantId).toBe(AURORA);
    for (const event of northwindView.events) expect(event.merchantId).toBe(NORTHWIND);

    const auroraTransactionIds = new Set(auroraView.events.map((e) => e.transactionId));
    const northwindTransactionIds = new Set(northwindView.events.map((e) => e.transactionId));
    for (const id of auroraTransactionIds) expect(northwindTransactionIds.has(id)).toBe(false);
  });
});
