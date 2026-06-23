import { notFound } from "next/navigation";
import { requireSectionAccess } from "../../../../lib/access";
import { getUserGroupsData } from "../../data";
import { GroupForm } from "../../group-form";

export default async function EditUserGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("users", "manage");
  const { id } = await params;

  const { groups, error } = await getUserGroupsData();
  if (error) notFound();
  const group = groups.find((g) => g.id === id);
  if (!group) notFound();

  return <GroupForm group={group} />;
}
