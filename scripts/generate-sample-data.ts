/**
 * Deterministic synthetic data generator.
 *
 * Generates a larger, more realistic set of synthetic transactions than
 * the hand-authored fixtures in data/samples/: repeat customers with a
 * baked-in reliability trait, weighted (non-uniform) outcome/method/value
 * distributions, and the same failure taxonomy the classifier in
 * @recoverai/analysis understands. Given the same --seed and --count,
 * output is byte-for-byte reproducible — this is fixture generation, not
 * simulation of real users.
 *
 * Usage:
 *   pnpm generate:data -- --count 10000 --seed 42
 *
 * Writes both data/generated/transactions.json (rich, with per-attempt
 * detail) and data/generated/transactions.csv (flat) from the same
 * underlying records.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../data/generated");

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, deterministic PRNG seeded by a single integer. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick() called with an empty array");
  return item;
}

/** Weighted pick from `[value, weight]` pairs — weights need not sum to 1. */
function pickWeighted<T>(
  rng: () => number,
  entries: ReadonlyArray<readonly [T, number]>,
): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

function parseArgs(argv: readonly string[]): { count: number; seed: number } {
  let count = 100;
  let seed = 42;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") count = Number(argv[++i]);
    if (argv[i] === "--seed") seed = Number(argv[++i]);
  }
  return { count, seed };
}

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

type FailureCode =
  | "issuer_decline"
  | "insufficient_funds"
  | "network_timeout"
  | "upi_failure"
  | "expired_card"
  | "authentication_failed"
  | "invalid_payment_details"
  | "processor_error"
  | "invalid_card"
  | "risk_blocked";

type PaymentMethod = "card" | "upi" | "netbanking" | "wallet" | "emi";

type OutcomeBucket =
  | "succeeded"
  | "failed_single"
  | "failed_repeated"
  | "checkout_abandonment"
  | "duplicate_submission"
  | "refund"
  | "pending";

const OUTCOME_BASE_WEIGHTS: ReadonlyArray<readonly [OutcomeBucket, number]> = [
  ["succeeded", 62],
  ["failed_single", 18],
  ["failed_repeated", 6],
  ["checkout_abandonment", 6],
  ["duplicate_submission", 2],
  ["refund", 2],
  ["pending", 4],
];

const FAILURE_CODE_WEIGHTS: ReadonlyArray<readonly [FailureCode, number]> = [
  ["issuer_decline", 28],
  ["insufficient_funds", 18],
  ["network_timeout", 14],
  ["upi_failure", 14],
  ["expired_card", 10],
  ["authentication_failed", 6],
  ["invalid_payment_details", 4],
  ["processor_error", 4],
  ["invalid_card", 1],
  ["risk_blocked", 1],
];

const PAYMENT_METHOD_WEIGHTS: ReadonlyArray<readonly [PaymentMethod, number]> = [
  ["card", 45],
  ["upi", 30],
  ["netbanking", 15],
  ["wallet", 7],
  ["emi", 3],
];

const MERCHANT_IDS = ["mer_aurora_retail", "mer_northwind_saas"] as const;

// ---------------------------------------------------------------------------
// Customer pool
// ---------------------------------------------------------------------------

interface SyntheticCustomer {
  readonly id: string;
  /** Baked-in trait in [0.15, 0.9]: how likely this customer's transactions are to succeed. Purely a generation-time device for realistic clustering — not a claim about real customer behavior. */
  readonly reliability: number;
}

function buildCustomerPool(
  count: number,
  rng: () => number,
): readonly SyntheticCustomer[] {
  const size = Math.max(20, Math.round(count / 4));
  return Array.from({ length: size }, (_, i) => ({
    id: `gen_cus_${String(i + 1).padStart(5, "0")}`,
    reliability: 0.15 + rng() * 0.75,
  }));
}

/** ~40% of transactions cluster onto the most "frequent" fifth of the customer pool; the rest spread across everyone. Deterministic, not literally random-user behavior. */
function pickCustomer(
  rng: () => number,
  customers: readonly SyntheticCustomer[],
): SyntheticCustomer {
  const frequentCount = Math.max(1, Math.round(customers.length * 0.2));
  if (rng() < 0.4) return pick(rng, customers.slice(0, frequentCount));
  return pick(rng, customers);
}

function pickOutcome(rng: () => number, customer: SyntheticCustomer): OutcomeBucket {
  const adjusted = OUTCOME_BASE_WEIGHTS.map(([bucket, weight]) => {
    if (bucket === "succeeded")
      return [bucket, weight * (0.4 + 1.2 * customer.reliability)] as const;
    return [bucket, weight * (1.4 - customer.reliability)] as const;
  });
  return pickWeighted(rng, adjusted);
}

/** 88% "typical" (₹150–₹3,000), 12% "large" (₹8,000–₹60,000) — right-skewed, and large enough at the top end to exercise high-value risk scoring. Amounts in paise. */
function pickAmountPaise(rng: () => number): number {
  const isLarge = rng() < 0.12;
  const [minRupees, maxRupees] = isLarge ? [8_000, 60_000] : [150, 3_000];
  const rupees = minRupees + Math.floor(rng() * (maxRupees - minRupees));
  return rupees * 100;
}

// ---------------------------------------------------------------------------
// Record shape (mirrors data/samples/transactions.json)
// ---------------------------------------------------------------------------

interface GeneratedAttempt {
  readonly id: string;
  readonly transactionId: string;
  readonly status: "succeeded" | "failed" | "pending";
  readonly paymentMethod: PaymentMethod;
  readonly failureReasonCode?: FailureCode;
  readonly attemptedAt: string;
}

interface GeneratedTransaction {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly amount: { readonly amount: number; readonly currency: string };
  readonly status: "succeeded" | "failed" | "pending" | "refunded" | "abandoned";
  readonly paymentMethod: PaymentMethod;
  readonly attempts: readonly GeneratedAttempt[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: { readonly scenario: string; readonly generated: true };
}

function buildAttempts(
  transactionId: string,
  outcome: OutcomeBucket,
  method: PaymentMethod,
  createdAtMs: number,
  rng: () => number,
): readonly GeneratedAttempt[] {
  const at = (offsetMs: number) => new Date(createdAtMs + offsetMs).toISOString();

  switch (outcome) {
    case "succeeded":
    case "refund":
      return [
        {
          id: `${transactionId}_atm_1`,
          transactionId,
          status: "succeeded",
          paymentMethod: method,
          attemptedAt: at(30_000),
        },
      ];
    case "pending":
      return [
        {
          id: `${transactionId}_atm_1`,
          transactionId,
          status: "pending",
          paymentMethod: method,
          attemptedAt: at(30_000),
        },
      ];
    case "checkout_abandonment":
      return [];
    case "duplicate_submission": {
      const code = pickWeighted(rng, FAILURE_CODE_WEIGHTS);
      return [
        {
          id: `${transactionId}_atm_1`,
          transactionId,
          status: "failed",
          paymentMethod: method,
          failureReasonCode: code,
          attemptedAt: at(20_000),
        },
        {
          id: `${transactionId}_atm_2`,
          transactionId,
          status: "failed",
          paymentMethod: method,
          failureReasonCode: code,
          attemptedAt: at(35_000),
        },
      ];
    }
    case "failed_single": {
      const code = pickWeighted(rng, FAILURE_CODE_WEIGHTS);
      return [
        {
          id: `${transactionId}_atm_1`,
          transactionId,
          status: "failed",
          paymentMethod: method,
          failureReasonCode: code,
          attemptedAt: at(30_000),
        },
      ];
    }
    case "failed_repeated": {
      const attemptCount = 2 + Math.floor(rng() * 3); // 2-4
      return Array.from({ length: attemptCount }, (_, i) => {
        const methodForAttempt =
          i > 0 && rng() < 0.3 ? pickWeighted(rng, PAYMENT_METHOD_WEIGHTS) : method;
        return {
          id: `${transactionId}_atm_${i + 1}`,
          transactionId,
          status: "failed" as const,
          paymentMethod: methodForAttempt,
          failureReasonCode: pickWeighted(rng, FAILURE_CODE_WEIGHTS),
          attemptedAt: at(30_000 + i * 15 * 60_000),
        };
      });
    }
  }
}

function outcomeToStatus(outcome: OutcomeBucket): GeneratedTransaction["status"] {
  switch (outcome) {
    case "succeeded":
      return "succeeded";
    case "refund":
      return "refunded";
    case "checkout_abandonment":
      return "abandoned";
    case "pending":
      return "pending";
    default:
      return "failed";
  }
}

function generate(count: number, seed: number): readonly GeneratedTransaction[] {
  const rng = mulberry32(seed);
  const customers = buildCustomerPool(count, rng);
  // Fixed anchor date (not wall-clock) so output is reproducible regardless of when the script runs.
  const anchorMs = Date.UTC(2026, 0, 1);
  const SPAN_MS = 45 * 24 * 60 * 60 * 1000; // spread over the last 45 days before the anchor

  const transactions: GeneratedTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const customer = pickCustomer(rng, customers);
    const outcome = pickOutcome(rng, customer);
    const method = pickWeighted(rng, PAYMENT_METHOD_WEIGHTS);
    const merchantId = pick(rng, MERCHANT_IDS);
    const amount = pickAmountPaise(rng);
    const createdAtMs = anchorMs - Math.floor(rng() * SPAN_MS);
    const id = `gen_txn_${String(i + 1).padStart(6, "0")}`;

    const attempts = buildAttempts(id, outcome, method, createdAtMs, rng);
    const lastAttemptedAt =
      attempts.at(-1)?.attemptedAt ?? new Date(createdAtMs).toISOString();

    transactions.push({
      id,
      merchantId,
      customerId: customer.id,
      amount: { amount, currency: "INR" },
      status: outcomeToStatus(outcome),
      paymentMethod: method,
      attempts,
      createdAt: new Date(createdAtMs).toISOString(),
      updatedAt: lastAttemptedAt,
      metadata: { scenario: outcome, generated: true },
    });
  }

  return transactions;
}

// ---------------------------------------------------------------------------
// CSV (flat) projection
// ---------------------------------------------------------------------------

function toCsv(transactions: readonly GeneratedTransaction[]): string {
  const header = [
    "id",
    "merchantId",
    "customerId",
    "amount",
    "currency",
    "status",
    "paymentMethod",
    "failureReasonCode",
    "attemptCount",
    "lastAttemptAt",
    "createdAt",
  ];

  const rows = transactions.map((tx) => {
    const lastFailed = [...tx.attempts].reverse().find((a) => a.status === "failed");
    return [
      tx.id,
      tx.merchantId,
      tx.customerId,
      String(tx.amount.amount),
      tx.amount.currency,
      tx.status,
      tx.paymentMethod,
      lastFailed?.failureReasonCode ?? "",
      String(tx.attempts.length),
      tx.updatedAt,
      tx.createdAt,
    ].join(",");
  });

  return [header.join(","), ...rows].join("\n") + "\n";
}

// ---------------------------------------------------------------------------

function main(): void {
  const { count, seed } = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(count) || count <= 0)
    throw new Error("--count must be a positive number");
  if (!Number.isFinite(seed)) throw new Error("--seed must be a number");

  const transactions = generate(count, seed);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonPath = resolve(OUTPUT_DIR, "transactions.json");
  writeFileSync(jsonPath, JSON.stringify(transactions, null, 2) + "\n", "utf-8");

  const csvPath = resolve(OUTPUT_DIR, "transactions.csv");
  writeFileSync(csvPath, toCsv(transactions), "utf-8");

  console.info(
    `Generated ${transactions.length} synthetic transactions (seed=${seed}) -> ${jsonPath} and ${csvPath}`,
  );
}

// Only run when executed directly (`tsx scripts/generate-sample-data.ts`), not when
// imported — this lets tests exercise `generate`/`toCsv` without writing files or
// fighting over process.argv.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { generate, toCsv, mulberry32, parseArgs };
export type { GeneratedTransaction };
