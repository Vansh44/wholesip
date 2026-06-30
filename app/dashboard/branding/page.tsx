import { requireSectionAccess } from "../lib/access";
import { getStoreBrandingForEditor } from "@/app/actions/store-branding";
import { BrandingForm } from "./branding-form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const access = await requireSectionAccess("branding", "view");
  const brand = await getStoreBrandingForEditor();
  return (
    <BrandingForm
      initial={brand}
      canManage={access.can("branding", "manage")}
    />
  );
}
