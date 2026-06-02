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
              const displayName = formatDisplayName(
                profile.email,
                profile.first_name,
                profile.last_name,
              );
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
                        {getInitials(
                          profile.email,
                          profile.first_name,
                          profile.last_name,
                        )}
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
                          className="min-w-[160px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                        >
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() => openDialog(profile, "role")}
                          >
                            Change role
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() => openDialog(profile, "suspend")}
                          >
                            {profile.is_suspended
                              ? "Un-suspend user"
                              : "Suspend user"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                          <DropdownMenuItem
                            className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
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
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">
              {actionType === "delete" && "Remove User"}
              {actionType === "role" && "Change Role"}
              {actionType === "suspend" &&
                (selectedUser?.is_suspended
                  ? "Un-suspend User"
                  : "Suspend User")}
            </DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
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
                <SelectTrigger className="border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4]">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent className="border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4]">
                  <SelectItem value="member">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            )}
            {(actionType === "delete" || actionType === "suspend") && (
              <p className="text-sm text-[#8b93a8]">
                User: {selectedUser?.email}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={isPending}
              className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
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
                  ? "bg-[#4f6ef7] text-white hover:bg-[#3d5ce5]"
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
