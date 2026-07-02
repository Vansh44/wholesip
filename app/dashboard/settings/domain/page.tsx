import { requireSectionAccess } from "@/app/dashboard/lib/access";
import {
  getCustomDomainDetails,
  getResendDomainStatus,
} from "@/app/actions/store-domain";
import { DomainSettingsView } from "./domain-settings-view";

export default async function DomainSettingsPage() {
  await requireSectionAccess("settings", "view");

  const { domain, resendDomainId } = await getCustomDomainDetails();

  let domainStatus = null;
  if (resendDomainId) {
    const { status } = await getResendDomainStatus(resendDomainId);
    if (status) {
      domainStatus = status;
    }
  }

  return (
    <DomainSettingsView
      initialDomain={domain}
      initialResendDomainId={resendDomainId}
      initialStatus={domainStatus}
    />
  );
}
