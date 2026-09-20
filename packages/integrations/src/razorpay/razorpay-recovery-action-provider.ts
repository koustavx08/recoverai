import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { RecoveryActionProvider } from "../interfaces/recovery-action-provider.js";
import type { RazorpayCredentials } from "./razorpay-config.js";
import { RazorpayClient } from "./razorpay-client.js";
import type { RazorpayPaymentLink } from "./razorpay-types.js";

/**
 * Real Razorpay-backed `RecoveryActionProvider`, scoped to exactly what
 * Razorpay's API can do without a saved payment token: creating and
 * checking a Payment Link the customer completes on their own.
 *
 * `auto_retry` needs a saved payment method (not part of this data
 * model — see README §11), `notification_email/sms/whatsapp` need a
 * separate messaging provider (see `../notifications/` — a real sender,
 * not a payment gateway concern), and `escalate_to_agent`/`none` involve
 * no external API call at all. This provider throws for all of those
 * rather than silently doing nothing or pretending to have attempted
 * something it can't — matching the rest of this codebase's rule of
 * never fabricating an outcome.
 */
export class RazorpayRecoveryActionProvider implements RecoveryActionProvider {
  readonly name = "razorpay";
  private readonly client: RazorpayClient;

  constructor(credentials: RazorpayCredentials, client?: RazorpayClient) {
    this.client = client ?? new RazorpayClient(credentials);
  }

  async execute(action: RecoveryAction): Promise<RecoveryResult> {
    if (action.type !== "payment_link") {
      throw new Error(
        `RazorpayRecoveryActionProvider only supports "payment_link" actions — got "${action.type}". ` +
          "auto_retry needs a saved payment token, notifications need a separate messaging provider, " +
          "and escalate_to_agent/none involve no Razorpay API call.",
      );
    }

    const amount = action.metadata?.amount;
    const currency = action.metadata?.currency;
    if (typeof amount !== "number" || typeof currency !== "string") {
      throw new Error(
        "RazorpayRecoveryActionProvider requires action.metadata.amount (number, smallest currency unit) " +
          "and action.metadata.currency (string) to create a payment link.",
      );
    }

    const link = await this.client.request<RazorpayPaymentLink>("POST", "/payment_links", {
      amount,
      currency,
      reference_id: action.transactionId,
      notes: { recoveryActionId: action.id },
    });

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded: false,
      notes: `Payment link created: ${link.short_url} (id: ${link.id}). Awaiting customer payment.`,
    };
  }

  /**
   * Re-checks a payment link's real status. Requires
   * `action.metadata.razorpayPaymentLinkId` — the `id` returned by
   * `execute()` — to already have been persisted onto the action; this
   * provider has no independent way to rediscover which link belongs to
   * which action.
   */
  async verify(action: RecoveryAction): Promise<RecoveryResult> {
    const paymentLinkId = action.metadata?.razorpayPaymentLinkId;
    if (typeof paymentLinkId !== "string") {
      throw new Error(
        "RazorpayRecoveryActionProvider.verify requires action.metadata.razorpayPaymentLinkId, " +
          "set from the id returned by execute().",
      );
    }

    const link = await this.client.request<RazorpayPaymentLink>("GET", `/payment_links/${paymentLinkId}`);
    const succeeded = link.status === "paid";

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      recoveredAmount: succeeded
        ? { amount: link.amount_paid ?? link.amount, currency: link.currency }
        : undefined,
      notes: `Payment link status: ${link.status}.`,
    };
  }
}
