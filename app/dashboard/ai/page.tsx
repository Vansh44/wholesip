import { requireSectionAccess } from "../lib/access";
import { getAiUsagePageData } from "@/app/actions/ai-credit-actions";
import { CREDIT_PACKS } from "@/lib/ai/credits";
import { AiUsageClient } from "./ai-usage-client";

export const metadata = { title: "AI usage" };

export default async function AiUsagePage() {
  const access = await requireSectionAccess("ai", "view");
  const data = await getAiUsagePageData();
  return (
    <AiUsageClient
      initialData={data}
      packs={[...CREDIT_PACKS]}
      canManage={access.can("ai", "manage")}
    />
  );
}
