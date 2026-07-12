import { requireSectionAccess } from "../lib/access";
import { getAiUsagePageData } from "@/app/actions/ai-credit-actions";
import { CREDIT_PACKS } from "@/lib/ai/credits";
import { PlansBillingClient } from "./plans-client";

export const metadata = { title: "Plans & Billing" };

// Permission section is still "ai" (the credit/AI actions gate on it) — only the
// nav label + route changed to "Plans & Billing".
export default async function PlansBillingPage() {
  const access = await requireSectionAccess("ai", "view");
  const data = await getAiUsagePageData();
  return (
    <PlansBillingClient
      initialData={data}
      packs={[...CREDIT_PACKS]}
      canManage={access.can("ai", "manage")}
    />
  );
}
