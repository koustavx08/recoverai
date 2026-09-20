import type { TwilioCredentials } from "./twilio-config.js";

/** Thrown for any non-2xx Twilio API response, carrying the real HTTP status and Twilio's own error code when present. */
export class TwilioApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "TwilioApiError";
  }
}

interface TwilioErrorPayload {
  readonly message?: string;
  readonly code?: number;
}

/**
 * Minimal, typed wrapper over Twilio's Messages REST API — HTTP Basic
 * Auth (`accountSid:authToken`) plus form-encoded requests (Twilio's API
 * is `application/x-www-form-urlencoded`, not JSON). Hand-rolled for the
 * same reason as `RazorpayClient`: real, narrow response types instead of
 * an SDK's looser ones.
 */
export class TwilioClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(credentials: TwilioCredentials, baseUrl?: string) {
    this.authHeader = `Basic ${Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString("base64")}`;
    this.baseUrl = baseUrl ?? `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}`;
  }

  async sendMessage<T>(params: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    return this.parse<T>(response);
  }

  async getMessage<T>(sid: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}/Messages/${sid}.json`, {
      method: "GET",
      headers: { Authorization: this.authHeader },
    });
    return this.parse<T>(response);
  }

  private async parse<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as (T & TwilioErrorPayload) | null;

    if (!response.ok) {
      const message = payload?.message ?? `Twilio API request failed with status ${response.status}.`;
      throw new TwilioApiError(message, response.status, payload?.code);
    }

    if (payload === null) {
      throw new TwilioApiError("Twilio API returned an unparseable response.", response.status);
    }

    return payload;
  }
}
