"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { InviteUserDialog } from "./invite-user-dialog";
import type { Profile } from "./page";
import {
  deleteUser,
  changeUserRole,
  toggleUserSuspension,
} from "@/app/actions/user-management";
import {
  formatDisplayName,
  getAvatarBackground,
  getInitials,
  getLastActiveLabel,
  getRoleDisplay,
  getStatusDisplay,
} from "../lib/dashboard-user-display";

type Props = {
  currentUserId: string;
  profiles: Profile[];
};

export function UsersManagementView({ currentUserId, profiles }: Props) {
  const router = useRouter();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [actionType, setActionType] = useState<
    "delete" | "role" | "suspend" | null
  >(null);
  const [newRole, setNewRole] = useState<string>("member");
  const [isPending, startTransition] = useTransition();

  const sortedProfiles = useMemo(
    () =>
      [...profiles].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [profiles],
  );

  const handleAction = async () => {
    if (!selectedUser || !actionType) return;

    startTransition(async () => {
      let result: { error?: string; success?: boolean } = {};

      switch (actionType) {
        case "delete":
          result = await deleteUser(selectedUser.id);
          break;
        case "role":
          result = await changeUserRole(selectedUser.id, newRole);
          break;
        case "suspend":
          result = await toggleUserSuspension(
            selectedUser.id,
            !selectedUser.is_suspended,
          );
          break;
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("User updated");
        closeDialog();
        router.refresh();
      }
    });
  };

  const closeDialog = () => {
    setActionType(null);
    setSelectedUser(null);
  };

  const openDialog = (user: Profile, type: typeof actionType) => {
    setSelectedUser(user);
    setActionType(type);
    if (type === "role") setNewRole(user.role);
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Users</h1>
          <p>Manage dashboard access — only authorised users</p>
        </div>
        <InviteUserDialog
          className="dash-btn dash-btn-primary shrink-0"
          label="＋ Invite User"
          size="default"
        />
      </header>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">Dashboard Users</div>
        </div>
        <table className="dash-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Active</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedProfiles.map((profile) => {
              const displayName = formatDisplayName(profile.email);
              const role = getRoleDisplay(profile.role);
              const status = getStatusDisplay(profile);

              return (
                <tr key={profile.id}>
                  <td>
                    <div className="dash-flex-row">
                      <div
                        className="dash-user-avatar"
                        style={{
                          background: getAvatarBackground(profile.email),
                        }}
                      >
                        {getInitials(profile.email)}
                      </div>
                      {displayName}
                    </div>
                  </td>
                  <td className="text-muted">{profile.email}</td>
                  <td>
                    <span className={`dash-role-pill ${role.pillClass}`}>
                      {role.icon} {role.label}
                    </span>
                  </td>
                  <td className="text-dim font-mono-dash">
                    {getLastActiveLabel(profile, currentUserId)}
                  </td>
                  <td>
                    <span className={`dash-badge ${status.badgeClass}`}>
                      {status.label}
                    </span>
                  </td>
                  <td>
                    {profile.id === currentUserId ? (
                      <span className="text-dim text-[12px]">—</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                          Edit
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[160px] border-[var(--dash-border)] bg-[var(--dash-surface-2)] text-[var(--dash-text)]"
                        >
                          <DropdownMenuItem
                            className="cursor-pointer focus:bg-[var(--dash-surface-3)]"
                            onClick={() => openDialog(profile, "role")}
                          >
                            Change role
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer focus:bg-[var(--dash-surface-3)]"
                            onClick={() => openDialog(profile, "suspend")}
                          >
                            {profile.is_suspended
                              ? "Un-suspend user"
                              : "Suspend user"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[var(--dash-border)]" />
                          <DropdownMenuItem
                            className="cursor-pointer text-[var(--dash-red)] focus:bg-[var(--dash-red-soft)] focus:text-[var(--dash-red)]"
                            onClick={() => openDialog(profile, "delete")}
                          >
                            Remove user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={actionType !== null}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent className="border-[var(--dash-border)] bg-[var(--dash-surface)] text-[var(--dash-text)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {actionType === "delete" && "Remove User"}
              {actionType === "role" && "Change Role"}
              {actionType === "suspend" &&
                (selectedUser?.is_suspended
                  ? "Un-suspend User"
                  : "Suspend User")}
            </DialogTitle>
            <DialogDescription className="text-[var(--dash-text-2)]">
              {actionType === "delete" &&
                "Are you sure you want to remove this user? This cannot be undone."}
              {actionType === "role" && "Select a new role for this user."}
              {actionType === "suspend" &&
                (selectedUser?.is_suspended
                  ? "This user will regain access."
                  : "This user will lose access immediately.")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {actionType === "role" && (
              <Select
                value={newRole}
                onValueChange={(val) => val && setNewRole(val)}
              >
                <SelectTrigger className="dash-input border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            )}
            {(actionType === "delete" || actionType === "suspend") && (
              <p className="text-sm text-[var(--dash-text-2)]">
                User: {selectedUser?.email}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={isPending}
              className="border-[var(--dash-border)] bg-transparent text-[var(--dash-text)] hover:bg-[var(--dash-surface-2)]"
            >
              Cancel
            </Button>
            <Button
              variant={
                actionType === "delete" ||
                (actionType === "suspend" && !selectedUser?.is_suspended)
                  ? "destructive"
                  : "default"
              }
              onClick={handleAction}
              disabled={isPending}
              className={
                actionType !== "delete" &&
                !(actionType === "suspend" && !selectedUser?.is_suspended)
                  ? "bg-[var(--dash-accent)] text-white hover:bg-[#3d5ce5]"
                  : undefined
              }
            >
              {isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
