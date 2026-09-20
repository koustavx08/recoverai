import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { brand } from "@recoverai/core";
import type { Database } from "@recoverai/database";

/**
 * Local-demo login credentials, seeded idempotently — mirrors this
 * codebase's existing pattern of seeding the bundled sample transactions
 * on every request (`loadPersistedTransactions`). Each account is scoped
 * to one of the two merchants present in `data/samples/transactions.json`
 * (`mer_aurora_retail`, `mer_northwind_saas`), so signing in as either
 * demonstrates real per-merchant data isolation — the dashboard shows only
 * that merchant's transactions, never both.
 *
 * The shared password is intentionally simple and documented in
 * `.env.example` / README: this is a demo/portfolio project, not a
 * multi-tenant SaaS with self-serve signup. A real deployment should
 * replace this seeding with a real account-provisioning flow and delete
 * this file.
 */
export const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "recoverai-demo";

export const DEMO_USERS = [
  { email: "aurora@recoverai.dev", merchantId: "mer_aurora_retail" },
  { email: "northwind@recoverai.dev", merchantId: "mer_northwind_saas" },
] as const;

let seeded = false;

export async function ensureDemoUsersSeeded(db: Database): Promise<void> {
  if (seeded) return;

  for (const demo of DEMO_USERS) {
    const existing = await db.users.findByEmail(demo.email);
    if (existing) continue;

    await db.users.save({
      id: brand<string, "UserId">(randomUUID()),
      email: demo.email,
      passwordHash: await bcrypt.hash(DEMO_USER_PASSWORD, 10),
      merchantId: brand<string, "MerchantId">(demo.merchantId),
      createdAt: brand<string, "ISODateString">(new Date().toISOString()),
    });
  }

  seeded = true;
}
