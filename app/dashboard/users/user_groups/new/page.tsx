import { requireSectionAccess } from "../../../lib/access";
import { GroupForm } from "../group-form";

export default async function NewUserGroupPage() {
  await requireSectionAccess("users", "manage");
  return <GroupForm group={null} />;
}
