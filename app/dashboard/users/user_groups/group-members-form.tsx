"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerMultiselect } from "@/components/customer-multiselect";
import { setGroupMembers } from "@/app/actions/user-group-actions";
import type { GroupCustomer, UserGroup } from "./shared";

type Props = {
  group: UserGroup;
  customers: GroupCustomer[];
};

const LIST_HREF = "/dashboard/users/user_groups";

export function GroupMembersForm({ group, customers }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.member_ids),
  );
  const [isPending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const handleSave = () => {
    startTransition(async () => {
      const result = await setGroupMembers(group.id, Array.from(selected));
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Members updated");
        router.push(LIST_HREF);
        router.refresh();
      }
    });
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header">
        <Link
          href={LIST_HREF}
          className="mb-2 inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#4f46e5]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to user groups
        </Link>
        <h1>Members — {group.name}</h1>
        <p>
          {selected.size} of {customers.length} customer
          {customers.length === 1 ? "" : "s"} selected.
        </p>
      </header>

      <div className="dash-card max-w-[640px] p-6">
        <CustomerMultiselect
          customers={customers}
          selected={selected}
          onToggle={toggle}
          onSetMany={setMany}
          maxHeightClass="max-h-[440px]"
        />

        <div className="mt-6 flex justify-end gap-2 border-t border-[#f0f0f0] pt-4">
          <Button
            variant="outline"
            onClick={() => router.push(LIST_HREF)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save members"}
          </Button>
        </div>
      </div>
    </div>
  );
}
