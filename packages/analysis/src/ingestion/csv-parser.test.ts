import { describe, expect, it } from "vitest";
import { parseCsvRecords } from "./csv-parser.js";

describe("parseCsvRecords", () => {
  it("parses a header row into keyed records", () => {
    const csv = "id,amount\ntxn_1,1000\ntxn_2,2000\n";
    const records = parseCsvRecords(csv);
    expect(records).toEqual([
      { row: 2, raw: { id: "txn_1", amount: "1000" } },
      { row: 3, raw: { id: "txn_2", amount: "2000" } },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'id,note\ntxn_1,"hello, world"\n';
    const records = parseCsvRecords(csv);
    expect(records[0]!.raw.note).toBe("hello, world");
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const csv = 'id,note\ntxn_1,"she said ""hi"""\n';
    const records = parseCsvRecords(csv);
    expect(records[0]!.raw.note).toBe('she said "hi"');
  });

  it("handles a file with no trailing newline", () => {
    const csv = "id,amount\ntxn_1,1000";
    const records = parseCsvRecords(csv);
    expect(records).toHaveLength(1);
    expect(records[0]!.raw.amount).toBe("1000");
  });

  it("omits empty cells from the raw record rather than storing empty strings", () => {
    const csv = "id,failureReasonCode\ntxn_1,\n";
    const records = parseCsvRecords(csv);
    expect(records[0]!.raw).toEqual({ id: "txn_1" });
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});
