import { requireSectionAccess } from "../lib/access";
import { getStoreBrandingForEditor } from "@/app/actions/store-branding";
import { getBrandVoiceForEditor } from "@/app/actions/brand-voice-actions";
import { BrandingForm } from "./branding-form";
import { BrandVoiceForm } from "./brand-voice-form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const access = await requireSectionAccess("branding", "view");
  const [brand, voice] = await Promise.all([
    getStoreBrandingForEditor(),
    getBrandVoiceForEditor(),
  ]);
  const canManage = access.can("branding", "manage");
  return (
    <>
      <BrandingForm initial={brand} canManage={canManage} />
      <BrandVoiceForm initial={voice} canManage={canManage} />
    </>
  );
}
