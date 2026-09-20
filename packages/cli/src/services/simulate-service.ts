import { z } from "zod";
import type { Logger, PaymentMethod } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { PaymentSimulator, seededFloat } from "@recoverai/integrations";
import type { CommandResult, SimulateSample } from "./types.js";

export const simulateOptionsSchema = z.object({
  count: z.coerce.number().int().positive().optional().default(10),
  seed: z.string().optional(),
  json: z.boolean().optional().default(false),
});
export type SimulateOptions = z.infer<typeof simulateOptionsSchema>;

const PAYMENT_METHODS: readonly PaymentMethod[] = ["card", "upi", "netbanking", "wallet", "emi"];

const SAMPLE_SIZE = 10;

/**
 * Exercises `@recoverai/integrations`' `PaymentSimulator` across `count`
 * synthetic, deterministically-seeded charge attempts — no real payment
 * credentials, no real transaction data required. Every outcome comes
 * from an actual `PaymentSimulator.charge()` call, not a fabricated
 * distribution; the same `--seed` always reproduces the same results.
 */
export async function runSimulate(options: SimulateOptions, logger: Logger): Promise<CommandResult> {
  logger.log("debug", "simulate service invoked", { count: options.count, seed: options.seed });

  const simulator = new PaymentSimulator();
  const seedPrefix = options.seed ?? "sim";
  const failureBreakdown: Record<string, number> = {};
  const sample: SimulateSample[] = [];
  let succeeded = 0;

  for (let i = 0; i < options.count; i++) {
    const transactionId = `${seedPrefix}_txn_${String(i + 1).padStart(5, "0")}`;
    const methodIndex = Math.floor(seededFloat(`${transactionId}:method`) * PAYMENT_METHODS.length);
    const paymentMethod = PAYMENT_METHODS[methodIndex] ?? "card";
    const amount = 10_000 + Math.floor(seededFloat(`${transactionId}:amount`) * 490_000);

    const result = await simulator.charge({
      transactionId: brand<string, "TransactionId">(transactionId),
      amount: { amount, currency: "INR" },
      paymentMethod,
    });

    if (result.succeeded) {
      succeeded++;
    } else if (result.failureReasonCode) {
      failureBreakdown[result.failureReasonCode] = (failureBreakdown[result.failureReasonCode] ?? 0) + 1;
    }

    if (sample.length < SAMPLE_SIZE) {
      sample.push({
        transactionId,
        paymentMethod,
        succeeded: result.succeeded,
        failureReasonCode: result.failureReasonCode,
      });
    }
  }

  const failed = options.count - succeeded;
  logger.log("info", "simulate run completed", { count: options.count, succeeded, failed });

  return {
    status: "simulated",
    command: "simulate",
    count: options.count,
    succeeded,
    failed,
    successRate: options.count > 0 ? (succeeded / options.count) * 100 : 0,
    failureBreakdown,
    sample,
  };
}
