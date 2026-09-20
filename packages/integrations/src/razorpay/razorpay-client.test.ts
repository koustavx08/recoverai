import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RazorpayApiError, RazorpayClient } from "./razorpay-client.js";

const CREDENTIALS = { keyId: "rzp_test_key", keySecret: "rzp_test_secret" };

describe("RazorpayClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends HTTP Basic Auth built from keyId:keySecret", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new RazorpayClient(CREDENTIALS);

    await client.request("GET", "/orders/order_1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const expected = `Basic ${Buffer.from("rzp_test_key:rzp_test_secret").toString("base64")}`;
    expect(headers.Authorization).toBe(expected);
  });

  it("returns the parsed JSON body on a 2xx response", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "order_abc" }), { status: 200 }));
    const client = new RazorpayClient(CREDENTIALS);

    const result = await client.request<{ id: string }>("GET", "/orders/order_abc");
    expect(result).toEqual({ id: "order_abc" });
  });

  it("throws RazorpayApiError with the real status and Razorpay's error description on failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { description: "Invalid amount", code: "BAD_REQUEST_ERROR" } }), {
        status: 400,
      }),
    );
    const client = new RazorpayClient(CREDENTIALS);

    await expect(client.request("POST", "/orders", { amount: -1 })).rejects.toMatchObject({
      status: 400,
      code: "BAD_REQUEST_ERROR",
      message: "Invalid amount",
    });
  });

  it("throws RazorpayApiError when the response body isn't valid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 500 }));
    const client = new RazorpayClient(CREDENTIALS);

    await expect(client.request("GET", "/orders/x")).rejects.toBeInstanceOf(RazorpayApiError);
  });
});
