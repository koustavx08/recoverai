import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TwilioApiError, TwilioClient } from "./twilio-client.js";

const CREDENTIALS = { accountSid: "AC_test", authToken: "token_test", fromNumber: "+14155551234" };

describe("TwilioClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a form-encoded POST with HTTP Basic Auth", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }));
    const client = new TwilioClient(CREDENTIALS);

    await client.sendMessage({ To: "+1", From: "+2", Body: "hi" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("AC_test:token_test").toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBe("To=%2B1&From=%2B2&Body=hi");
  });

  it("throws TwilioApiError with Twilio's own message/code on failure", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid To number", code: 21211 }), { status: 400 }),
    );
    const client = new TwilioClient(CREDENTIALS);

    await expect(client.sendMessage({ To: "bad", From: "+2", Body: "hi" })).rejects.toMatchObject({
      status: 400,
      code: 21211,
      message: "Invalid To number",
    });
  });

  it("GETs a message by sid for status lookups", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", status: "delivered" }), { status: 200 }));
    const client = new TwilioClient(CREDENTIALS);

    const result = await client.getMessage<{ sid: string; status: string }>("SM1");
    expect(result.status).toBe("delivered");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages/SM1.json");
    expect(init.method).toBe("GET");
  });

  it("throws TwilioApiError on an unparseable response", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 500 }));
    const client = new TwilioClient(CREDENTIALS);
    await expect(client.getMessage("SM1")).rejects.toBeInstanceOf(TwilioApiError);
  });
});
