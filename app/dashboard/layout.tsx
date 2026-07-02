import { redirect } from "next/navigation";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getStoreBrand } from "@/lib/store/brand";
import { DashboardTopbar } from "./dashboard-topbar";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileNavProvider } from "./dashboard-mobile-nav";
import { getViewerContext } from "./lib/access";
import { getNewEnquiriesCount } from "./enquiries/data";
import {
  SECTIONS,
  SECTION_GROUPS,
  can,
  type SectionGroup,
} from "./lib/permissions";
import "./dashboard.css";

const dashFont = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-dash",
});

const dashMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dash-mono",
});

export async function generateMetadata() {
  const brand = await getStoreBrand();
  return {
    title: `${brand.name} — Operations Center`,
    icons: brand.logoUrl ? { icon: brand.logoUrl } : { icon: "/icon.svg" },
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Shared, request-cached resolution (getUser → profiles → roles). The page
  // rendering inside this layout reuses the SAME result via getViewerAccess.
  const ctx = await getViewerContext();

  if (!ctx) {
    redirect("/auth/login");
  }

  const { userId, userEmail, profile, isSuperadmin, permissions } = ctx;

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-4 text-[#111827]">
        <div className="max-w-lg space-y-4 rounded-2xl border border-[rgba(17,24,39,0.08)] bg-white p-8 shadow-[0_12px_32px_-8px_rgba(16,24,40,0.16)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-lg font-bold text-amber-600">
              ⚠️
            </div>
            <div>
              <h1 className="text-lg font-bold">Profile Not Found</h1>
              <p className="text-sm text-[#5b6472]">
                Your auth account exists but has no profile row.
              </p>
            </div>
          </div>
          <p className="text-sm text-[#5b6472]">
            Run the following SQL in your Supabase SQL Editor:
          </p>
          <pre className="overflow-auto rounded-lg border border-[rgba(17,24,39,0.08)] bg-[#f3f4f6] p-3 text-xs text-[#111827]">
            {`INSERT INTO profiles (id, email, role, force_password_reset)\nVALUES ('${userId}', '${userEmail}', 'superadmin', false);`}
          </pre>
          <p className="text-xs text-[#8b93a3]">
            After inserting, refresh this page.
          </p>
        </div>
      </div>
    );
  }

  // isSuperadmin + permissions come from the shared cached context above.

  // Live count of unhandled enquiries → sidebar badge (only when the viewer can
  // see enquiries, and only when there's at least one new one).
  const canViewEnquiries = can(permissions, "enquiries", "view", isSuperadmin);
  const newEnquiries = canViewEnquiries ? await getNewEnquiriesCount() : 0;

  // Build the sidebar from the permission catalog: a section appears only when
  // the viewer can view it. The Dashboard home is always shown so everyone has
  // a landing page. Empty groups are dropped. The enquiries item gets a live
  // badge spliced in (without mutating the shared SECTIONS catalog).
  const navGroups = SECTION_GROUPS.map((group) => ({
    group,
    items: SECTIONS.filter(
      (s) =>
        s.group === group &&
        (s.key === "dashboard" ||
          can(permissions, s.key, "view", isSuperadmin)),
    ).map((s) =>
      s.key === "enquiries" && newEnquiries > 0
        ? { ...s, badge: String(newEnquiries), badgeTone: "amber" as const }
        : s,
    ),
  })).filter((g) => g.items.length > 0) as {
    group: SectionGroup;
    items: typeof SECTIONS;
  }[];

  // The acting store's brand (logo + name) for the sidebar.
  const brand = await getStoreBrand();

  return (
    <div
      className={`dashboard-shell ${dashFont.variable} ${dashMono.variable} flex`}
    >
      <MobileNavProvider>
        <DashboardSidebar
          groups={navGroups}
          logoUrl={brand.logoUrl}
          storeName={brand.name}
        />

        <div className="dash-main">
          <DashboardTopbar
            email={profile.email}
            role={profile.role ?? ""}
            firstName={profile.first_name}
            lastName={profile.last_name}
          />
          <div className="dash-content">{children}</div>
        </div>
      </MobileNavProvider>

      <Toaster richColors position="top-right" />
    </div>
  );
}
