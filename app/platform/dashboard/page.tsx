import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlatformViewer, listAllStores } from "@/app/actions/platform";
import { StoresConsole } from "./stores-console";

export const metadata = { title: "Storemink Admin" };

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storemink.com";

export default async function PlatformDashboard({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Must be signed in to the platform, and be a platform operator.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const viewer = await getPlatformViewer();
  if (!viewer) {
    return (
      <div className="stq-auth-wrap">
        <div className="stq-auth">
          <h1>Not authorized</h1>
          <p className="sub">
            {user.email} isn&apos;t a Storemink operator. If you run a store,
            log in at your store&apos;s address instead.
          </p>
          <Link href="/login" className="stq-btn stq-btn-ghost stq-btn-block">
            Store login
          </Link>
        </div>
      </div>
    );
  }

  const { q } = await searchParams;
  const stores = await listAllStores(q);

  return (
    <StoresConsole
      stores={stores}
      canManage={viewer.role === "superadmin"}
      email={viewer.email}
      q={q ?? ""}
      rootDomain={ROOT_DOMAIN}
    />
  );
}
