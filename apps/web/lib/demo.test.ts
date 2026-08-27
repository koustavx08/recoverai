import { describe, expect, it } from "vitest";
import { loadDemoScenarios } from "./demo";

describe("loadDemoScenarios", () => {
  it("returns exactly the five named demo cases, in file order, excluding the supporting-history transaction", async () => {
    const view = await loadDemoScenarios();
    expect(view).not.toBeNull();
    if (!view) return;

    expect(view.scenarios.map((s) => s.id)).toEqual([
      "demo_txn_01",
      "demo_txn_02",
      "demo_txn_03",
      "demo_txn_04",
      "demo_txn_05",
    ]);
  });

  it("produces the documented pipeline outcome for every case, from a real pipeline run", async () => {
    const view = await loadDemoScenarios();
    expect(view).not.toBeNull();
    if (!view) return;

    const byId = new Map(view.scenarios.map((s) => [s.id, s]));

    expect(byId.get("demo_txn_01")?.result.status).toBe("completed");
    expect(byId.get("demo_txn_01")?.result.execution?.result.outcome).toBe("success");

    expect(byId.get("demo_txn_02")?.result.status).toBe("skipped");
    expect(byId.get("demo_txn_02")?.result.detection?.result.detected).toBe(false);

    expect(byId.get("demo_txn_03")?.result.status).toBe("blocked");
    expect(byId.get("demo_txn_03")?.result.detection?.result.actionable).toBe(false);
    expect(byId.get("demo_txn_03")?.result.diagnosis).toBeUndefined();

    expect(byId.get("demo_txn_04")?.result.status).toBe("blocked");
    expect(byId.get("demo_txn_04")?.result.strategy?.decision.strategy).toBe("manual_review");

    expect(byId.get("demo_txn_05")?.result.status).toBe("blocked");
    expect(byId.get("demo_txn_05")?.result.execution?.result.outcome).toBe("pending");
  });

  it("every scenario has non-empty title and narrative copy", async () => {
    const view = await loadDemoScenarios();
    expect(view).not.toBeNull();
    if (!view) return;

    for (const scenario of view.scenarios) {
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.narrative.length).toBeGreaterThan(0);
    }
  });
});
