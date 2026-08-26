/**
 * Deterministic synthetic data generator.
 *
 * Generates a larger set of synthetic transactions than the hand-authored
 * fixtures in data/samples/, using the same scenario taxonomy, for load
 * testing and demos. Given the same --seed and --count, output is
 * byte-for-byte reproducible.
 *
 * Usage:
 *   pnpm generate:data -- --count 200 --seed 42
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../data/generated");

type Scenario =
  | "successful_payment"
  | "issuer_decline"
  | "insufficient_funds"
  | "upi_failure"
  | "network_timeout"
  | "expired_card"
  | "checkout_abandonment"
  | "repeated_payment_failures"
  | "refund"
  | "pending_authorization";

const SCENARIOS: readonly Scenario[] = [
  "successful_payment",
  "issuer_decline",
  "insufficient_funds",
  "upi_failure",
  "network_timeout",
  "expired_card",
  "checkout_abandonment",
  "repeated_payment_failures",
  "refund",
  "pending_authorization",
];

const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet", "emi"] as const;
const MERCHANT_IDS = ["mer_aurora_retail", "mer_northwind_saas"] as const;

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

function parseArgs(argv: readonly string[]): { count: number; seed: number } {
  let count = 100;
  let seed = 42;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") count = Number(argv[++i]);
    if (argv[i] === "--seed") seed = Number(argv[++i]);
  }
  return { count, seed };
}

interface GeneratedTransaction {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly amount: { readonly amount: number; readonly currency: string };
  readonly status: string;
  readonly paymentMethod: string;
  readonly attempts: ReadonlyArray<{
    readonly id: string;
    readonly transactionId: string;
    readonly status: string;
    readonly paymentMethod: string;
    readonly attemptedAt: string;
  }>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: { readonly scenario: Scenario };
}

function scenarioToStatus(scenario: Scenario): string {
  switch (scenario) {
    case "successful_payment":
      return "succeeded";
    case "refund":
      return "refunded";
    case "checkout_abandonment":
      return "abandoned";
    case "pending_authorization":
      return "pending";
    default:
      return "failed";
  }
}

function generate(count: number, seed: number): readonly GeneratedTransaction[] {
  const rng = mulberry32(seed);
  const baseTime = Date.UTC(2025, 3, 1);
  const transactions: GeneratedTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const scenario = pick(rng, SCENARIOS);
    const status = scenarioToStatus(scenario);
    const paymentMethod = pick(rng, PAYMENT_METHODS);
    const merchantId = pick(rng, MERCHANT_IDS);
    const amount = 5000 + Math.floor(rng() * 495000);
    const createdAt = new Date(baseTime + i * 3_600_000).toISOString();
    const id = `gen_txn_${String(i + 1).padStart(6, "0")}`;
    const attemptCount =
      scenario === "checkout_abandonment"
        ? 0
        : scenario === "repeated_payment_failures"
          ? 3
          : 1;

    const attempts = Array.from({ length: attemptCount }, (_, attemptIndex) => ({
      id: `${id}_atm_${attemptIndex + 1}`,
      transactionId: id,
      status:
        status === "succeeded" || status === "refunded"
          ? "succeeded"
          : status === "pending"
            ? "pending"
            : "failed",
      paymentMethod,
      attemptedAt: new Date(
        baseTime + i * 3_600_000 + attemptIndex * 60_000,
      ).toISOString(),
    }));

    transactions.push({
      id,
      merchantId,
      customerId: `gen_cus_${String((i % 50) + 1).padStart(4, "0")}`,
      amount: { amount, currency: "INR" },
      status,
      paymentMethod,
      attempts,
      createdAt,
      updatedAt: attempts.at(-1)?.attemptedAt ?? createdAt,
      metadata: { scenario },
    });
  }

  return transactions;
}

function main(): void {
  const { count, seed } = parseArgs(process.argv.slice(2));
  const transactions = generate(count, seed);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = resolve(OUTPUT_DIR, "transactions.json");
  writeFileSync(outPath, JSON.stringify(transactions, null, 2) + "\n", "utf-8");

  console.info(
    `Generated ${transactions.length} synthetic transactions (seed=${seed}) -> ${outPath}`,
  );
}

main();
