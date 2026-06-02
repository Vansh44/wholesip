import { createClient } from "@/lib/supabase/server";

export async function HeroPanel() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName = "Admin";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
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

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <header className="dash-page-header">
      <h1>
        {greeting}, {displayName} 👋
      </h1>
      <p>Here&apos;s what&apos;s happening with your store today.</p>
    </header>
  );
}
