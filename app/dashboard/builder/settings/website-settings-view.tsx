"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { EditorSetting } from "@/app/actions/store-settings";
import { FeatureToggles } from "../../components/feature-toggles";

export function WebsiteSettingsView({
  plan,
  initialSettings,
  canManage,
}: {
  plan: string;
  initialSettings: EditorSetting[];
  canManage: boolean;
}) {
  return (
    <div className="dash-page-enter mx-auto w-full max-w-3xl">
      <header className="dash-page-header">
        <Link
          href="/dashboard/builder"
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#5b6472] hover:text-[#111827]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Website Builder
        </Link>
        <h1>Website settings</h1>
        <p>Configure what the website builder allows on this store.</p>
      </header>

      <div className="mt-4 space-y-5">
        {initialSettings.length > 0 ? (
          <FeatureToggles
            title="Builder features"
            successMessage="Website settings saved."
            plan={plan}
            initialSettings={initialSettings}
            canManage={canManage}
          />
        ) : (
          <p className="py-2 text-[13px] text-[#8b93a3]">
            No website settings are available for your role.
          </p>
        )}
      </div>
    </div>
  );
}
