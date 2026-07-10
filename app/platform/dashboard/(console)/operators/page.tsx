import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlatformViewer, listPlatformAdmins } from "@/app/actions/platform";
import { OperatorsConsole } from "../operators-console";

export const metadata = { title: "Operators — StoreMink Admin" };

export default async function OperatorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard/login");

  const viewer = await getPlatformViewer();
  if (!viewer) redirect("/dashboard");

  const admins = await listPlatformAdmins();
  return (
    <OperatorsConsole
      admins={admins}
      canManage={viewer.role === "superadmin"}
      myEmail={viewer.email}
    />
  );
}
