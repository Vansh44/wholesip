"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteRole } from "@/app/actions/role-actions";
import { SECTIONS, roleBadgeClass } from "../lib/permissions";
import type { Role } from "../lib/access";
import { RoleEditorDialog } from "./role-editor-dialog";

type RoleRow = Role & { member_count: number };

type Props = {
  roles: RoleRow[];
  canManage: boolean;
};

function summarize(role: RoleRow) {
  let viewable = 0;
  let manageable = 0;
  for (const section of SECTIONS) {
    const granted = role.permissions[section.key] ?? [];
    if (granted.includes("manage")) {
      manageable++;
      viewable++;
    } else if (granted.includes("view")) {
      viewable++;
    }
  }
  return { viewable, manageable };
}

export function RolesManagementView({ roles, canManage }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const openEditor = (role?: Role) => {
    setEditing(role ?? null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
  };

  const handleSaved = () => {
    closeEditor();
    router.refresh();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteRole(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Role deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>🔑 Roles &amp; Permissions</h1>
          <p>
            Define roles and control which sections of the dashboard each one
            can access.
          </p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => openEditor()}
          >
            ＋ New Role
          </button>
        )}
      </header>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Roles
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {roles.length} {roles.length === 1 ? "role" : "roles"}
            </span>
          </div>
        </div>

        {roles.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              No roles yet
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              Run <code>supabase/roles_table.sql</code> to seed the system
              roles, then create your own.
            </div>
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Access</th>
                <th>Admins</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const { viewable, manageable } = summarize(role);
                return (
                  <tr key={role.id}>
                    <td>
                      <div className="dash-flex-row" style={{ gap: 8 }}>
                        <span
                          className={`dash-role-pill ${roleBadgeClass(role.color)}`}
                        >
                          {role.slug === "superadmin" ? "⚡" : "🔑"} {role.name}
                        </span>
                        {role.is_system && (
                          <span
                            className="dash-badge dash-badge-grey"
                            style={{ fontSize: 10 }}
                          >
                            System
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="text-muted"
                      style={{ maxWidth: 320, fontSize: 12.5 }}
                    >
                      {role.description || "—"}
                    </td>
                    <td className="text-dim" style={{ fontSize: 12 }}>
                      {role.slug === "superadmin" ? (
                        <span>Full access</span>
                      ) : (
                        <span>
                          {viewable} view · {manageable} manage
                        </span>
                      )}
                    </td>
                    <td className="text-dim font-mono-dash">
                      {role.member_count}
                    </td>
                    <td>
                      {canManage ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                            Actions
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[160px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => openEditor(role)}
                            >
                              ✏️ Edit
                            </DropdownMenuItem>
                            {!role.is_system && (
                              <>
                                <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                                <DropdownMenuItem
                                  className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                                  onClick={() => setDeleteTarget(role)}
                                >
                                  🗑 Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-dim text-[12px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Delete Role</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Delete &ldquo;{deleteTarget?.name}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {(deleteTarget?.member_count ?? 0) > 0 && (
            <div className="py-2">
              <p className="text-sm text-amber-400">
                ⚠️ {deleteTarget?.member_count} admin
                {deleteTarget?.member_count === 1 ? "" : "s"} currently hold
                this role. Reassign them first.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
              className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RoleEditorDialog
        open={editorOpen}
        role={editing}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
