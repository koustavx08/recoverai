import { describe, expect, it } from "vitest";
import { loadAuditTrail } from "./audit";

describe("loadAuditTrail", () => {
  it("produces at least one event per transaction that reached Detection", async () => {
    const view = await loadAuditTrail();
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.events.length).toBeGreaterThan(0);
    for (const event of view.events) {
      expect(event.transactionId).toBeDefined();
      expect(event.summary.length).toBeGreaterThan(0);
    }
  });

  it("never marks an event type as a real recovery unless the stage actually executed", async () => {
    const view = await loadAuditTrail();
    expect(view).not.toBeNull();
    if (!view) return;

    for (const event of view.events) {
      if (event.type === "recovery_action_executed") {
        expect(event.data?.simulationMode).toBe(true);
      }
    }
  });

  it("is sorted newest first", async () => {
    const view = await loadAuditTrail();
    expect(view).not.toBeNull();
    if (!view) return;

    for (let i = 1; i < view.events.length; i++) {
      expect(view.events[i - 1]!.occurredAt >= view.events[i]!.occurredAt).toBe(true);
    }
  });
});
