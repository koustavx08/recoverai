import { redirect } from "next/navigation";
import { brand, type MerchantId } from "@recoverai/core";
import { auth } from "@/auth";

/**
 * Every dashboard page under `app/(dashboard)/` calls this to scope its
 * data loader to the signed-in merchant. `middleware.ts` already redirects
 * an unauthenticated request to `/login` before a page ever renders, so
 * the `redirect` here is defense in depth (e.g. a session that expired
 * between the middleware check and this render), not the primary gate.
 */
export async function requireMerchantId(): Promise<MerchantId> {
  const session = await auth();
  const merchantId = session?.user?.merchantId;
  if (!merchantId) redirect("/login");
  return brand<string, "MerchantId">(merchantId);
}
