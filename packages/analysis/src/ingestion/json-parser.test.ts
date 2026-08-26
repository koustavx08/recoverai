import { describe, expect, it } from "vitest";
import { parseJsonRecords } from "./json-parser.js";

describe("parseJsonRecords", () => {
  it("tags records with a nested attempts array as rich", () => {
    const records = parseJsonRecords(JSON.stringify([{ id: "a", attempts: [] }]));
    expect(records).toEqual([{ row: 1, shape: "rich", raw: { id: "a", attempts: [] } }]);
  });

  it("tags records without attempts as flat", () => {
    const records = parseJsonRecords(JSON.stringify([{ id: "a" }]));
    expect(records[0]!.shape).toBe("flat");
  });

  it("assigns 1-based row numbers in source order", () => {
    const records = parseJsonRecords(
      JSON.stringify([{ id: "a" }, { id: "b" }, { id: "c" }]),
    );
    expect(records.map((r) => r.row)).toEqual([1, 2, 3]);
  });

  it("throws a clear error on invalid JSON", () => {
    expect(() => parseJsonRecords("{not json")).toThrow(/not valid JSON/);
  });

  it("throws a clear error when the top level isn't an array", () => {
    expect(() => parseJsonRecords(JSON.stringify({ id: "a" }))).toThrow(
      /top-level array/,
    );
  });
});
