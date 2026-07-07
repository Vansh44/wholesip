import { redirect } from "next/navigation";
import Link from "next/link";
import { Sora, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getStoreBrand } from "@/lib/store/brand";
import { DashboardTopbar } from "./dashboard-topbar";
import { DashboardSidebar } from "./dashboard-sidebar";
import { MobileNavProvider } from "./dashboard-mobile-nav";
import { getViewerContext } from "./lib/access";
import { getNewEnquiriesCount } from "./enquiries/data";
import { getLowStockAlertCount } from "./inventory/data";
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

  const { userEmail, profile, isSuperadmin, permissions } = ctx;

  if (!profile) {
    // Authenticated, but this account is not staff of THIS store (and not a
    // platform operator). In the multi-tenant model that's simply "no access"
    // — never expose SQL / a self-provision path, which would be a privilege
    // escalation hint.
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-4 text-[#111827]">
        <div className="max-w-md space-y-4 rounded-2xl border border-[rgba(17,24,39,0.08)] bg-white p-8 text-center shadow-[0_12px_32px_-8px_rgba(16,24,40,0.16)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-2xl">
            🔒
          </div>
          <h1 className="text-lg font-bold">No access to this dashboard</h1>
          <p className="text-sm text-[#5b6472]">
            You&apos;re signed in as{" "}
            <span className="font-medium text-[#111827]">{userEmail}</span>, but
            this account isn&apos;t a staff member of this store. If this is
            your store, sign in with the account you used to create it.
          </p>
          <Link
            href="/auth/login"
            className="inline-block rounded-lg bg-[#E5E4E2] hover:bg-[#CFCFCF] px-5 py-2.5 text-sm font-semibold text-[#ffffff] transition-colors duration-200"
          >
            Switch account
          </Link>
        </div>
      </div>
    );
  }

  // isSuperadmin + permissions come from the shared cached context above.

  // Live count of unhandled enquiries → sidebar badge (only when the viewer can
  // see enquiries, and only when there's at least one new one).
  const canViewEnquiries = can(permissions, "enquiries", "view", isSuperadmin);
  const newEnquiries = canViewEnquiries ? await getNewEnquiriesCount() : 0;

  const canViewInventory = can(permissions, "inventory", "view", isSuperadmin);
  const lowStockAlerts = canViewInventory ? await getLowStockAlertCount() : 0;

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
    ).map((s) => {
      if (s.key === "enquiries" && newEnquiries > 0) {
        return {
          ...s,
          badge: String(newEnquiries),
          badgeTone: "amber" as const,
        };
      }
      if (s.key === "inventory" && lowStockAlerts > 0) {
        return {
          ...s,
          badge: String(lowStockAlerts),
          badgeTone: "amber" as const,
        };
      }
      if (s.key === "inventory") {
        const { badge: _badge, badgeTone: _badgeTone, ...rest } = s;
        return rest;
      }
      return s;
    }),
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

      <Toaster richColors />
    </div>
  );
}
