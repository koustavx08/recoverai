export interface TwilioCredentials {
  readonly accountSid: string;
  readonly authToken: string;
  /** E.164 SMS sender number, e.g. "+14155551234". */
  readonly fromNumber: string;
  /** WhatsApp-enabled sender number (no "whatsapp:" prefix — added automatically). Required only for notification_whatsapp actions. */
  readonly whatsappFromNumber?: string;
}
