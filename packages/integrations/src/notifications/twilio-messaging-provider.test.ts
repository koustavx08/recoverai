import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecoveryAction } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { TwilioMessagingProvider } from "./twilio-messaging-provider.js";
import { TwilioClient } from "./twilio-client.js";

const CREDENTIALS = {
  accountSid: "AC_test",
  authToken: "token_test",
  fromNumber: "+14155551234",
  whatsappFromNumber: "+14155559999",
};

function smsAction(metadata?: Record<string, string | number | boolean | null>): RecoveryAction {
  return {
    id: brand<string, "RecoveryActionId">("action_1"),
    transactionId: brand<string, "TransactionId">("txn_1"),
    type: "notification_sms",
    strategy: "manual_followup",
    status: "pending",
    metadata,
  };
}

describe("TwilioMessagingProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let provider: TwilioMessagingProvider;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    provider = new TwilioMessagingProvider(CREDENTIALS, new TwilioClient(CREDENTIALS));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("execute", () => {
    it("sends a real SMS and reports dispatch success", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", status: "queued" }), { status: 201 }));

      const result = await provider.execute(smsAction({ recipientPhone: "+919876543210" }));

      expect(result.succeeded).toBe(true);
      expect(result.notes).toContain("SM1");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(String(init.body)).toContain("To=%2B919876543210");
    });

    it("prefixes both From and To with whatsapp: for notification_whatsapp actions", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM2", status: "queued" }), { status: 201 }));

      const action = { ...smsAction({ recipientPhone: "+919876543210" }), type: "notification_whatsapp" } as RecoveryAction;
      await provider.execute(action);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = String(init.body);
      expect(body).toContain("From=whatsapp%3A%2B14155559999");
      expect(body).toContain("To=whatsapp%3A%2B919876543210");
    });

    it("reports dispatch failure when Twilio reports failed/undelivered", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM3", status: "failed" }), { status: 201 }));
      const result = await provider.execute(smsAction({ recipientPhone: "+919876543210" }));
      expect(result.succeeded).toBe(false);
    });

    it("throws for unsupported action types", async () => {
      const action = { ...smsAction(), type: "auto_retry" } as RecoveryAction;
      await expect(provider.execute(action)).rejects.toThrow(/only supports "notification_sms"/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when recipientPhone metadata is missing", async () => {
      await expect(provider.execute(smsAction())).rejects.toThrow(/requires action\.metadata\.recipientPhone/);
    });
  });

  describe("verify", () => {
    it("reports success only when Twilio confirms delivered/read, not merely sent", async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", status: "sent" }), { status: 200 }));
      const sentOnly = await provider.verify(smsAction({ twilioMessageSid: "SM1" }));
      expect(sentOnly.succeeded).toBe(false);

      fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: "SM1", status: "delivered" }), { status: 200 }));
      const delivered = await provider.verify(smsAction({ twilioMessageSid: "SM1" }));
      expect(delivered.succeeded).toBe(true);
    });

    it("throws when twilioMessageSid metadata is missing", async () => {
      await expect(provider.verify(smsAction())).rejects.toThrow(/twilioMessageSid/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
