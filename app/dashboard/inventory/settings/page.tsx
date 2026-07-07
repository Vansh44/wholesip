import { requireSectionAccess } from "../../lib/access";
import { getStoreSettingsForEditor } from "@/app/actions/store-settings";
import { FeatureToggles } from "@/app/dashboard/components/feature-toggles";

export default async function InventorySettingsPage() {
  const access = await requireSectionAccess("inventory", "view");

  const { plan, settings } = await getStoreSettingsForEditor("Inventory");

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header">
        <h1>Inventory Settings</h1>
        <p>
          Configure how inventory tracking and display behaves on your store
        </p>
      </header>

      <div className="max-w-2xl mt-6">
        <FeatureToggles
          title="Inventory"
          plan={plan}
          initialSettings={settings}
          canManage={access.can("inventory", "manage")}
        />
      </div>
    </div>
  );
}
