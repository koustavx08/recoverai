import type { RecoveryAction, RecoveryResult } from "@recoverai/core";
import type { RecoveryActionProvider } from "../interfaces/recovery-action-provider.js";
import type { TwilioCredentials } from "./twilio-config.js";
import { TwilioClient } from "./twilio-client.js";
import type { TwilioMessage } from "./twilio-types.js";

const DISPATCH_FAILURE_STATUSES = new Set(["failed", "undelivered"]);
const CONFIRMED_DELIVERED_STATUSES = new Set(["delivered", "read"]);

function defaultBody(action: RecoveryAction): string {
  return `We noticed a payment issue on transaction ${action.transactionId}. Please retry or contact support.`;
}

/**
 * Real Twilio-backed `RecoveryActionProvider` for `notification_sms` and
 * `notification_whatsapp` actions. Sends a real message via Twilio's
 * Messages API; `execute()`'s `succeeded` reflects whether Twilio actually
 * *dispatched* the message (not "failed"/"undelivered" yet), and
 * `verify()` — given the message sid `execute()` returned — reports
 * whether Twilio's own status callback shows it was actually
 * "delivered"/"read", a real signal Twilio provides (unlike raw SMTP).
 *
 * RecoverAI's data model never stores a customer's real phone number (see
 * README §11) — `execute()` requires the caller to supply one via
 * `action.metadata.recipientPhone` rather than inventing one.
 */
export class TwilioMessagingProvider implements RecoveryActionProvider {
  readonly name = "twilio";
  private readonly client: TwilioClient;
  private readonly fromNumber: string;
  private readonly whatsappFromNumber?: string;

  constructor(credentials: TwilioCredentials, client?: TwilioClient) {
    this.client = client ?? new TwilioClient(credentials);
    this.fromNumber = credentials.fromNumber;
    this.whatsappFromNumber = credentials.whatsappFromNumber;
  }

  async execute(action: RecoveryAction): Promise<RecoveryResult> {
    if (action.type !== "notification_sms" && action.type !== "notification_whatsapp") {
      throw new Error(
        `TwilioMessagingProvider only supports "notification_sms"/"notification_whatsapp" actions — ` +
          `got "${action.type}".`,
      );
    }

    const to = action.metadata?.recipientPhone;
    if (typeof to !== "string" || to.length === 0) {
      throw new Error(
        "TwilioMessagingProvider requires action.metadata.recipientPhone (E.164 string) to send a message.",
      );
    }

    const isWhatsapp = action.type === "notification_whatsapp";
    if (isWhatsapp && !this.whatsappFromNumber) {
      throw new Error(
        "TwilioMessagingProvider requires credentials.whatsappFromNumber to send a WhatsApp message.",
      );
    }

    const body = typeof action.metadata?.body === "string" ? action.metadata.body : defaultBody(action);

    const message = await this.client.sendMessage<TwilioMessage>({
      To: isWhatsapp ? `whatsapp:${to}` : to,
      From: isWhatsapp ? `whatsapp:${this.whatsappFromNumber}` : this.fromNumber,
      Body: body,
    });

    const succeeded = !DISPATCH_FAILURE_STATUSES.has(message.status);
    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      notes: `Twilio message ${message.sid} dispatch status: ${message.status}.`,
    };
  }

  /**
   * Requires `action.metadata.twilioMessageSid` — the `sid` returned by
   * `execute()` — to already have been persisted onto the action; this
   * provider has no independent way to rediscover which message belongs
   * to which action.
   */
  async verify(action: RecoveryAction): Promise<RecoveryResult> {
    const messageSid = action.metadata?.twilioMessageSid;
    if (typeof messageSid !== "string") {
      throw new Error(
        "TwilioMessagingProvider.verify requires action.metadata.twilioMessageSid, set from the sid " +
          "returned by execute().",
      );
    }

    const message = await this.client.getMessage<TwilioMessage>(messageSid);
    const succeeded = CONFIRMED_DELIVERED_STATUSES.has(message.status);

    return {
      actionId: action.id,
      transactionId: action.transactionId,
      succeeded,
      notes: `Twilio message ${message.sid} status: ${message.status}.`,
    };
  }
}
