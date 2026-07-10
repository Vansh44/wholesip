import { requireSectionAccess } from "../lib/access";
import { getBillingForEditor } from "@/app/actions/billing-actions";
import { BillingClient } from "./billing-client";

export const metadata = { title: "Invoices & Billing" };

export default async function BillingPage() {
  const access = await requireSectionAccess("billing", "view");
  const { settings, taxClasses } = await getBillingForEditor();
  const canManage = access.can("billing", "manage");
  return (
    <BillingClient
      initialSettings={settings}
      initialTaxClasses={taxClasses}
      canManage={canManage}
    />
  );
}
