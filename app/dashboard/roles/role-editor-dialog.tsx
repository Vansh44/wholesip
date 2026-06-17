/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createRole,
  updateRole,
  type RoleFormData,
} from "@/app/actions/role-actions";
import {
  SECTIONS,
  SECTION_GROUPS,
  ROLE_COLORS,
  type PermissionAction,
  type RolePermissions,
} from "../lib/permissions";
import type { Role } from "../lib/access";

type Props = {
  open: boolean;
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: RoleFormData = {
  name: "",
  description: "",
  color: "blue",
  permissions: {},
};

const fieldClass =
  "w-full rounded-md border border-[var(--dash-border)] bg-[var(--dash-surface)] px-3 py-2 text-sm text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-text-3)] focus:border-[var(--dash-accent)]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--dash-text-2)]";

const COLOR_SWATCH: Record<string, string> = {
  grey: "#6b7280",
  blue: "#4f46e5",
  green: "#15a34a",
  amber: "#d97706",
  violet: "#7c3aed",
};

export function RoleEditorDialog({ open, role, onClose, onSaved }: Props) {
  const [form, setForm] = useState<RoleFormData>(EMPTY);
  const [isPending, startTransition] = useTransition();
  const isEditing = !!role;
  const isSuperadmin = role?.slug === "superadmin";

  useEffect(() => {
    if (!open) return;
    if (role) {
      setForm({
        name: role.name,
        description: role.description ?? "",
        color: role.color || "blue",
        permissions: { ...role.permissions },
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, role]);

  const isOn = (section: string, action: PermissionAction) =>
    (form.permissions[section] ?? []).includes(action);

  const toggle = (section: string, action: PermissionAction) => {
    setForm((f) => {
      const current = new Set(f.permissions[section] ?? []);
      if (current.has(action)) {
        current.delete(action);
        // Removing view also removes manage (manage implies view).
        if (action === "view") current.delete("manage");
      } else {
        current.add(action);
        // Granting manage implies view.
        if (action === "manage") current.add("view");
      }
      const next: RolePermissions = { ...f.permissions };
      const arr = Array.from(current) as PermissionAction[];
      if (arr.length === 0) delete next[section];
      else next[section] = arr;
      return { ...f, permissions: next };
    });
  };

  const set = <K extends keyof RoleFormData>(key: K, value: RoleFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Role name is required");
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateRole(role!.id, form)
        : await createRole(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Role updated" : "Role created");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit role — ${role?.name}` : "New role"}
          </DialogTitle>
          <DialogDescription>
            Choose which dashboard sections this role can view and manage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                className={fieldClass}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Support"
                maxLength={40}
              />
            </div>
            <div>
              <label className={labelClass}>Colour</label>
              <div className="flex items-center gap-2 pt-1">
                {ROLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("color", c)}
                    aria-label={c}
                    className={`h-6 w-6 rounded-full transition ${
                      form.color === c
                        ? "ring-2 ring-[var(--dash-text)] ring-offset-2 ring-offset-[var(--dash-surface)]"
                        : "opacity-70 hover:opacity-100"
                    }`}
                    style={{ background: COLOR_SWATCH[c] }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${fieldClass} min-h-[60px] resize-y`}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What is this role for?"
            />
          </div>

          <div>
            <label className={labelClass}>Permissions</label>

            {isSuperadmin ? (
              <div className="flex items-start gap-2 rounded-md border border-[var(--dash-violet)]/30 bg-[var(--dash-violet-soft)] px-3 py-3 text-sm text-[var(--dash-violet)]">
                <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Superadmin always has full, unrestricted access. Its
                  permissions can&rsquo;t be narrowed.
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {SECTION_GROUPS.map((group) => {
                  const sections = SECTIONS.filter((s) => s.group === group);
                  return (
                    <div key={group}>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--dash-text-3)]">
                        {group}
                      </div>
                      <div className="overflow-hidden rounded-md border border-[var(--dash-border)]">
                        {sections.map((section, i) => (
                          <div
                            key={section.key}
                            className={`flex items-center justify-between px-3 py-2 ${
                              i > 0
                                ? "border-t border-[var(--dash-border)]"
                                : ""
                            }`}
                          >
                            <span className="text-sm text-[var(--dash-text)]">
                              {section.label}
                            </span>
                            <div className="flex items-center gap-4">
                              {(["view", "manage"] as PermissionAction[]).map(
                                (action) => {
                                  const supported =
                                    section.actions.includes(action);
                                  return (
                                    <label
                                      key={action}
                                      className={`flex items-center gap-1.5 text-xs ${
                                        supported
                                          ? "cursor-pointer text-[var(--dash-text-2)]"
                                          : "cursor-not-allowed text-[var(--dash-text-3)] opacity-60"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={!supported}
                                        checked={
                                          supported && isOn(section.key, action)
                                        }
                                        onChange={() =>
                                          toggle(section.key, action)
                                        }
                                        className="h-3.5 w-3.5 accent-[var(--dash-accent)]"
                                      />
                                      {action === "view" ? "View" : "Manage"}
                                    </label>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save changes"
                : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
