import { describe, expect, it } from "vitest";
import { brand } from "./common.js";
import type { TransactionId } from "./common.js";

describe("brand", () => {
  it("returns the underlying value unchanged at runtime", () => {
    const id = brand<string, "TransactionId">("txn_00001") as TransactionId;
    expect(id).toBe("txn_00001");
  });

  it("preserves string equality semantics", () => {
    const a = brand<string, "TransactionId">("txn_00001");
    const b = "txn_00001";
    expect(a === b).toBe(true);
  });
});
