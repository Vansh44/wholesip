import { requireSectionAccess } from "../../lib/access";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";
import { WebsiteSettingsView } from "./website-settings-view";

// Website settings live WITH the builder feature (convention #9, like
// /dashboard/blogs/settings): the registry's "Website" group — currently the
// custom-code toggle, enforced server-side in page-actions.ts.
export default async function WebsiteSettingsPage() {
  const access = await requireSectionAccess("builder", "view");

  const { plan, settings } = await getStoreSettingsForEditor("Website");

  return (
    <WebsiteSettingsView
      plan={plan}
      initialSettings={settings}
      canManage={access.can("builder", "manage")}
    />
  );
}
