import type { RazorpayCredentials } from "./razorpay-config.js";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/** Thrown for any non-2xx Razorpay API response, carrying the real HTTP status and Razorpay's own error code when present. */
export class RazorpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

interface RazorpayErrorPayload {
  readonly error?: {
    readonly description?: string;
    readonly code?: string;
  };
}

/**
 * Minimal, typed wrapper over Razorpay's REST API — HTTP Basic Auth
 * (`key_id:key_secret`) plus JSON in/out. Deliberately hand-rolled rather
 * than the official `razorpay` SDK, which ships largely untyped
 * (`any`-returning) methods; this repo's TypeScript is strict everywhere
 * else and callers here get real response types (`razorpay-types.ts`),
 * not `any`.
 */
export class RazorpayClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(credentials: RazorpayCredentials, baseUrl: string = RAZORPAY_API_BASE) {
    this.authHeader = `Basic ${Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64")}`;
    this.baseUrl = baseUrl;
  }

  async request<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const payload = (await response.json().catch(() => null)) as (T & RazorpayErrorPayload) | null;

    if (!response.ok) {
      const description =
        payload?.error?.description ?? `Razorpay API request failed with status ${response.status}.`;
      throw new RazorpayApiError(description, response.status, payload?.error?.code);
    }

    if (payload === null) {
      throw new RazorpayApiError("Razorpay API returned an unparseable response.", response.status);
    }

    return payload;
  }
}
