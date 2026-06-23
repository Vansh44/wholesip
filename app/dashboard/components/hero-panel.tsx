import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export async function HeroPanel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "Admin";

  if (user) {
    const { data: profile } = await supabase
      .from("admins")
      .select("first_name")
      .eq("id", user.id)
      .single();

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
