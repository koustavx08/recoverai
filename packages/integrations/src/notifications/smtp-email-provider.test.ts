import type { Transporter } from "nodemailer";
import { describe, expect, it, vi } from "vitest";
import type { RecoveryAction } from "@recoverai/core";
import { brand } from "@recoverai/core";
import { SmtpEmailProvider } from "./smtp-email-provider.js";

const CREDENTIALS = {
  host: "smtp.example.com",
  port: 587,
  user: "apikey",
  password: "secret",
  fromAddress: "RecoverAI <recovery@merchant.example>",
};

function emailAction(metadata?: Record<string, string | number | boolean | null>): RecoveryAction {
  return {
    id: brand<string, "RecoveryActionId">("action_1"),
    transactionId: brand<string, "TransactionId">("txn_1"),
    type: "notification_email",
    strategy: "manual_followup",
    status: "pending",
    metadata,
  };
}

function fakeTransporter(sendMail: ReturnType<typeof vi.fn>) {
  return { sendMail } as unknown as Transporter;
}

describe("SmtpEmailProvider", () => {
  describe("execute", () => {
    it("sends a real email and reports success only when the SMTP server accepted the recipient", async () => {
      const sendMail = vi.fn().mockResolvedValue({ accepted: ["customer@example.com"], messageId: "msg-1" });
      const provider = new SmtpEmailProvider(CREDENTIALS, fakeTransporter(sendMail));

      const result = await provider.execute(emailAction({ recipientEmail: "customer@example.com" }));

      expect(result.succeeded).toBe(true);
      expect(result.notes).toContain("msg-1");
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "customer@example.com", from: CREDENTIALS.fromAddress }),
      );
    });

    it("reports failure when the SMTP server rejected the recipient", async () => {
      const sendMail = vi.fn().mockResolvedValue({ accepted: [], rejected: ["customer@example.com"], messageId: "msg-2" });
      const provider = new SmtpEmailProvider(CREDENTIALS, fakeTransporter(sendMail));

      const result = await provider.execute(emailAction({ recipientEmail: "customer@example.com" }));
      expect(result.succeeded).toBe(false);
    });

    it("throws for action types it doesn't support", async () => {
      const provider = new SmtpEmailProvider(CREDENTIALS, fakeTransporter(vi.fn()));
      const action = { ...emailAction(), type: "notification_sms" } as RecoveryAction;
      await expect(provider.execute(action)).rejects.toThrow(/only supports "notification_email"/);
    });

    it("throws when recipientEmail metadata is missing", async () => {
      const provider = new SmtpEmailProvider(CREDENTIALS, fakeTransporter(vi.fn()));
      await expect(provider.execute(emailAction())).rejects.toThrow(/requires action\.metadata\.recipientEmail/);
    });
  });

  describe("verify", () => {
    it("is not supported — raw SMTP has no post-send delivery signal", async () => {
      const provider = new SmtpEmailProvider(CREDENTIALS, fakeTransporter(vi.fn()));
      await expect(provider.verify(emailAction())).rejects.toThrow(/not supported/);
    });
  });
});
