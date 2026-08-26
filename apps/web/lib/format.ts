import type { Money } from "@recoverai/core";

/** Groups digits Indian-style (lakh/crore), e.g. 4284500 -> "42,84,500". */
function formatIndianGrouping(value: number): string {
  const isNegative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString();
  if (digits.length <= 3) return `${isNegative ? "-" : ""}${digits}`;

  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${isNegative ? "-" : ""}${rest},${last3}`;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { INR: "₹", USD: "$" };

/** Formats a `Money` value (stored in the smallest currency unit) for display, rounded to whole currency units. */
export function formatMoney(money: Money): string {
  const symbol = CURRENCY_SYMBOLS[money.currency] ?? `${money.currency} `;
  return `${symbol}${formatIndianGrouping(Math.round(money.amount / 100))}`;
}

export function formatCount(value: number): string {
  return formatIndianGrouping(value);
}
