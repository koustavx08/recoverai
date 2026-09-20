/** Narrow, hand-typed shape of the fields this package reads from Twilio's Message resource. */
export interface TwilioMessage {
  readonly sid: string;
  /** "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | "read" | ... */
  readonly status: string;
  readonly error_code?: number | null;
  readonly error_message?: string | null;
}
