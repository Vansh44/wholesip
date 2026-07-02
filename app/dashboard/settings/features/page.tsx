import { requireSectionAccess } from "@/app/dashboard/lib/access";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";
import { FeatureSettingsView } from "./feature-settings-view";

export default async function FeatureSettingsPage() {
  const access = await requireSectionAccess("settings", "view");
  const { plan, settings } = await getStoreSettingsForEditor();

  return (
    <FeatureSettingsView
      plan={plan}
      initialSettings={settings}
      canManage={access.can("settings", "manage")}
    />
  );
}
