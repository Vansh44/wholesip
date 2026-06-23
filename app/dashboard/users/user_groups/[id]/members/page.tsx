import { notFound } from "next/navigation";
import { requireSectionAccess } from "../../../../lib/access";
import { getUserGroupsData } from "../../data";
import { GroupMembersForm } from "../../group-members-form";

export default async function GroupMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("users", "manage");
  const { id } = await params;

  const { groups, customers, error } = await getUserGroupsData();
  if (error) notFound();
  const group = groups.find((g) => g.id === id);
  if (!group) notFound();

  return <GroupMembersForm group={group} customers={customers} />;
}
