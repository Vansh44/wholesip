import { requireSectionAccess } from "../lib/access";
import { getStoreMenusForEditor } from "@/app/actions/menu-actions";
import { NavigationEditor } from "./navigation-editor";

export const metadata = { title: "Navigation" };

export default async function NavigationPage() {
  const access = await requireSectionAccess("navigation", "view");
  const menus = await getStoreMenusForEditor();
  return (
    <NavigationEditor
      initial={menus}
      canManage={access.can("navigation", "manage")}
    />
  );
}
