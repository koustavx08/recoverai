import nodemailer, { type Transporter } from "nodemailer";
import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { RecoveryActionProvider } from "../interfaces/recovery-action-provider.js";
import type { SmtpCredentials } from "./smtp-config.js";

const DEFAULT_SUBJECT = "Complete your payment";

function defaultBody(action: RecoveryAction): string {
  return `We noticed a payment issue on transaction ${action.transactionId}. Please retry or contact support.`;
}

/**
 * Real SMTP-backed `RecoveryActionProvider`, scoped to `notification_email`
 * actions only. Sends a real email via `nodemailer`; `succeeded` reflects
 * whether the SMTP server actually accepted the recipient for delivery
 * (`info.accepted`), not a fabricated guess.
 *
 * RecoverAI's data model never stores a customer's real email address
 * (see README §11) — `execute()` requires the caller to supply one via
 * `action.metadata.recipientEmail` rather than silently no-op'ing or
 * inventing one.
 */
export class SmtpEmailProvider implements RecoveryActionProvider {
  readonly name = "smtp";
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(credentials: SmtpCredentials, transporter?: Transporter) {
    this.fromAddress = credentials.fromAddress;
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: credentials.host,
        port: credentials.port,
        secure: credentials.secure ?? credentials.port === 465,
        auth: { user: credentials.user, pass: credentials.password },
      });
  }

  async execute(action: RecoveryAction): Promise<RecoveryResult> {
    if (action.type !== "notification_email") {
      throw new Error(
        `SmtpEmailProvider only supports "notification_email" actions — got "${action.type}".`,
      );
    }

    const to = action.metadata?.recipientEmail;
    if (typeof to !== "string" || to.length === 0) {
      throw new Error(
        "SmtpEmailProvider requires action.metadata.recipientEmail (string) to send an email.",
      );
    }

    const subject = typeof action.metadata?.subject === "string" ? action.metadata.subject : DEFAULT_SUBJECT;
    const text = typeof action.metadata?.body === "string" ? action.metadata.body : defaultBody(action);

    const info = await this.transporter.sendMail({ from: this.fromAddress, to, subject, text });
    const succeeded = (info.accepted ?? []).some((address) => String(address) === to);

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      notes: succeeded
        ? `Email accepted by SMTP server for delivery to ${to} (messageId: ${info.messageId}).`
        : `SMTP server did not accept ${to} for delivery.`,
    };
  }

  /**
   * Raw SMTP has no delivery/open-tracking API — the accept/reject signal
   * `execute()` returns synchronously is the only real signal this
   * provider can ever give. Re-checking later would either re-send the
   * email or fabricate a status; neither is honest, so this throws.
   */
  async verify(_action: RecoveryAction): Promise<RecoveryResult> {
    throw new Error(
      "SmtpEmailProvider.verify is not supported — raw SMTP has no post-send delivery/open tracking " +
        "signal. execute()'s accept/reject result is the only real signal available.",
    );
  }
}
