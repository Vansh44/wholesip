"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createUserGroup,
  updateUserGroup,
  type GroupFormData,
} from "@/app/actions/user-group-actions";
import { GROUP_COLORS, groupBadgeClass, type UserGroup } from "./shared";

type Props = {
  group: UserGroup | null;
};

const LIST_HREF = "/dashboard/users/user_groups";

const fieldClass =
  "w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#4f46e5]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7280]";

export function GroupForm({ group }: Props) {
  const router = useRouter();
  const isEditing = !!group;
  const [form, setForm] = useState<GroupFormData>({
    name: group?.name ?? "",
    description: group?.description ?? "",
    color: group?.color ?? "blue",
  });
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof GroupFormData>(key: K, value: GroupFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateUserGroup(group!.id, form)
        : await createUserGroup(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Group updated" : "Group created");
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
        <h1>{isEditing ? "Edit group" : "New group"}</h1>
        <p>Segment customers to target coupons and emails.</p>
      </header>

      <div className="dash-card max-w-[560px] p-6">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name *</label>
            <input
              className={fieldClass}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. VIP shoppers"
            />
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <input
              className={fieldClass}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional — what this group is for"
            />
          </div>

          <div>
            <label className={labelClass}>Colour</label>
            <div className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className={`dash-badge ${groupBadgeClass(c)} capitalize ${
                    form.color === c
                      ? "ring-2 ring-[#4f46e5] ring-offset-1"
                      : "opacity-70"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-[#f0f0f0] pt-4">
          <Button
            variant="outline"
            onClick={() => router.push(LIST_HREF)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save changes"
                : "Create group"}
          </Button>
        </div>
      </div>
    </div>
  );
}
