import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { admins } from "@/drizzle/schema";
import { getServerUser } from "@/lib/auth/server-user";

export async function HeroPanel() {
  const user = await getServerUser();

  let displayName = "Admin";

  if (user) {
    const rows = await withService((db) =>
      db
        .select({ first_name: admins.firstName })
        .from(admins)
        .where(eq(admins.id, user.id))
        .limit(1),
    ).catch(() => []);
    const profile = rows[0];

    if (profile?.first_name) {
      displayName = profile.first_name;
    } else if (user.email) {
      const local = user.email.split("@")[0] ?? "Admin";
      displayName = local.charAt(0).toUpperCase() + local.slice(1);
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="dash-page-header row">
      <div>
        <div className="mb-1.5 font-mono-dash text-[11.5px] font-medium uppercase tracking-[0.08em] text-[var(--dash-text-3)]">
          {dateLabel}
        </div>
        <h1>
          {greeting}, {displayName}
        </h1>
        <p>Here&apos;s what&apos;s happening with your store today.</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        <button type="button" className="dash-btn dash-btn-ghost">
          <Download className="h-4 w-4" />
          Export
        </button>
        <Link href="/dashboard/orders" className="dash-btn dash-btn-primary">
          <Plus className="h-4 w-4" />
          New Order
        </Link>
      </div>
    </header>
  );
}
