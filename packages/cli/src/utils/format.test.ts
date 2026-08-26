import { describe, expect, it } from "vitest";
import { formatCount, formatIndianGrouping, formatMoney } from "./format.js";

describe("formatIndianGrouping", () => {
  it("matches the standard lakh/crore grouping example", () => {
    expect(formatIndianGrouping(4284500)).toBe("42,84,500");
  });

  it("leaves numbers under 1000 ungrouped", () => {
    expect(formatIndianGrouping(999)).toBe("999");
    expect(formatIndianGrouping(0)).toBe("0");
  });

  it("groups exactly at the thousands boundary", () => {
    expect(formatIndianGrouping(1000)).toBe("1,000");
    expect(formatIndianGrouping(100000)).toBe("1,00,000"); // 1 lakh
    expect(formatIndianGrouping(10000000)).toBe("1,00,00,000"); // 1 crore
  });

  it("handles negative numbers", () => {
    expect(formatIndianGrouping(-4284500)).toBe("-42,84,500");
  });
});

describe("formatMoney", () => {
  it("formats INR paise as rupees with the ₹ symbol", () => {
    expect(formatMoney({ amount: 428450000, currency: "INR" })).toBe("₹42,84,500");
  });

  it("rounds to the nearest whole currency unit", () => {
    expect(formatMoney({ amount: 199, currency: "INR" })).toBe("₹2");
  });

  it("falls back to the currency code for an unrecognized currency", () => {
    expect(formatMoney({ amount: 100000, currency: "XYZ" })).toBe("XYZ 1,000");
  });
});

describe("formatCount", () => {
  it("Indian-groups a plain count", () => {
    expect(formatCount(10000)).toBe("10,000");
  });
});
