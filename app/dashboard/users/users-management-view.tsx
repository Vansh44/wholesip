"use client";

import { useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteUserDialog } from "./invite-user-dialog";
import type { Profile } from "./page";

type Props = {
  currentUserId: string;
  profiles: Profile[];
};

type StatusFilter = "all" | "active" | "pending";
type SortOption = "name" | "recent" | "role";

function formatDisplayName(email: string) {
  const localPart = email.split("@")[0]?.replace(/[0-9]+$/g, "") ?? "";
  const segmented = localPart
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[._\-\s]+/)
    .filter(Boolean);

  if (segmented.length === 0) {
    return "Workspace Member";
  }

  return segmented
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getRoleLabel(role: string) {
  if (role === "superadmin") return "Owner";
  if (role === "member") return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getRoleClasses(role: string) {
  if (role === "superadmin") {
    return "bg-[#F3F4F6] text-[#111827] border-transparent";
  }

  if (role === "member") {
    return "bg-[#FAFAFA] text-[#6B7280] border-[#E5E7EB]";
  }

  return "bg-[#F3F4F6] text-[#6B7280] border-[#E5E7EB]";
}

function getStatusMeta(profile: Profile) {
  if (profile.force_password_reset) {
    return {
      label: "Pending",
      dot: "bg-[#F59E0B]",
      classes: "bg-[#FEF3C7] text-[#B45309] border-transparent",
    };
  }

  return {
    label: "Active",
    dot: "bg-[#10B981]",
    classes: "bg-[#D1FAE5] text-[#047857] border-transparent",
  };
}

function getLastActiveLabel(profile: Profile, currentUserId: string) {
  if (profile.force_password_reset) {
    return "Never";
  }

  if (profile.id === currentUserId) {
    return "Now";
  }

  const daysSinceAdded = Math.floor(
    (Date.now() - new Date(profile.created_at).getTime()) / 86400000,
  );

  if (daysSinceAdded <= 1) return "Today";
  if (daysSinceAdded <= 7) return `${daysSinceAdded}d ago`;
  if (daysSinceAdded <= 30) return `${Math.floor(daysSinceAdded / 7)}w ago`;

  return "Recently";
}

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UsersManagementView({ currentUserId, profiles }: Props) {
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");

  const metrics = useMemo(
    () => [
      {
        label: "Total Users",
        value: profiles.length,
      },
      {
        label: "Active",
        value: profiles.filter((profile) => !profile.force_password_reset)
          .length,
      },
      {
        label: "Pending",
        value: profiles.filter((profile) => profile.force_password_reset)
          .length,
      },
    ],
    [profiles],
  );

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const nextProfiles = profiles.filter((profile) => {
      const displayName = formatDisplayName(profile.email).toLowerCase();
      const matchesQuery =
        normalizedQuery.length === 0 ||
        profile.email.toLowerCase().includes(normalizedQuery) ||
        displayName.includes(normalizedQuery) ||
        getRoleLabel(profile.role).toLowerCase().includes(normalizedQuery);

      const matchesRole =
        roleFilter === "all" ||
        getRoleLabel(profile.role).toLowerCase() === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !profile.force_password_reset) ||
        (statusFilter === "pending" && profile.force_password_reset);

      return matchesQuery && matchesRole && matchesStatus;
    });

    nextProfiles.sort((left, right) => {
      if (sort === "name") {
        return formatDisplayName(left.email).localeCompare(
          formatDisplayName(right.email),
        );
      }

      if (sort === "role") {
        return getRoleLabel(left.role).localeCompare(getRoleLabel(right.role));
      }

      return (
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
      );
    });

    return nextProfiles;
  }, [profiles, query, roleFilter, sort, statusFilter]);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col animate-in fade-in duration-300">
      <section className="mb-12 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <h1 className="text-[40px] font-[700] leading-tight tracking-tight text-[#111827]">
            User Management
          </h1>
          <p className="max-w-2xl text-[16px] text-[#6B7280]">
            Manage workspace members, permissions, roles and access across your
            organization.
          </p>
        </div>
        <InviteUserDialog
          className="h-11 rounded-[10px] bg-[#0F172A] px-6 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-[#1E293B]"
          label="Add User"
          size="default"
        />
      </section>

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[12px] border border-[#E5E7EB] bg-white p-6"
          >
            <p className="mb-3 text-[14px] font-medium text-[#6B7280]">
              {metric.label}
            </p>
            <p className="text-[32px] font-[700] leading-none text-[#111827]">
              {metric.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-[460px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users, email, role..."
            className="h-11 w-full rounded-[10px] border-[#E5E7EB] bg-white pl-10 pr-4 text-[14px] shadow-sm placeholder:text-[#6B7280] focus-visible:ring-[#0F172A]"
          />
        </div>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto">
          <Select
            value={roleFilter}
            onValueChange={(value) => setRoleFilter(value ?? "all")}
          >
            <SelectTrigger className="h-11 min-w-[140px] rounded-[10px] border-[#E5E7EB] bg-white px-3 text-[14px] shadow-sm">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter((value as StatusFilter) ?? "all")
            }
          >
            <SelectTrigger className="h-11 min-w-[140px] rounded-[10px] border-[#E5E7EB] bg-white px-3 text-[14px] shadow-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(value) =>
              setSort((value as SortOption) ?? "recent")
            }
          >
            <SelectTrigger className="h-11 min-w-[140px] rounded-[10px] border-[#E5E7EB] bg-white px-3 text-[14px] shadow-sm">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Newest</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="role">Role</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="mb-12 overflow-hidden rounded-[16px] border border-[#E5E7EB] bg-white">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="border-b border-[#E5E7EB] hover:bg-transparent bg-[#FAFAFA]">
                <TableHead className="h-12 pl-6 text-[12px] font-medium text-[#6B7280]">
                  User
                </TableHead>
                <TableHead className="h-12 text-[12px] font-medium text-[#6B7280]">
                  Role
                </TableHead>
                <TableHead className="h-12 text-[12px] font-medium text-[#6B7280]">
                  Status
                </TableHead>
                <TableHead className="h-12 text-[12px] font-medium text-[#6B7280]">
                  Last Active
                </TableHead>
                <TableHead className="h-12 text-[12px] font-medium text-[#6B7280]">
                  Date Added
                </TableHead>
                <TableHead className="h-12 pr-6 text-right text-[12px] font-medium text-[#6B7280] w-[80px]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredProfiles.map((profile) => {
                const displayName = formatDisplayName(profile.email);
                const roleLabel = getRoleLabel(profile.role);
                const status = getStatusMeta(profile);

                return (
                  <TableRow
                    key={profile.id}
                    className="group min-h-[72px] border-b border-[#E5E7EB] transition-colors hover:bg-[#FAFAFA] last:border-0"
                  >
                    <TableCell className="pl-6 py-4 h-[72px]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[13px] font-medium text-[#111827] border border-[#E5E7EB]">
                          {displayName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-medium text-[#111827]">
                              {displayName}
                            </p>
                            {profile.id === currentUserId && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-[#E5E7EB] bg-[#FAFAFA] px-1.5 py-0 text-[10px] font-medium text-[#6B7280]"
                              >
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-[13px] text-[#6B7280] mt-0.5">
                            {profile.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="py-4 h-[72px]">
                      <span
                        className={`inline-flex rounded-full border px-[10px] py-1 text-[12px] font-medium ${getRoleClasses(profile.role)}`}
                      >
                        {roleLabel}
                      </span>
                    </TableCell>

                    <TableCell className="py-4 h-[72px]">
                      <div
                        className={`inline-flex items-center gap-1.5 rounded-full border px-[10px] py-1 text-[12px] font-medium ${status.classes}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                        />
                        {status.label}
                      </div>
                    </TableCell>

                    <TableCell className="py-4 text-[14px] text-[#6B7280] h-[72px]">
                      {getLastActiveLabel(profile, currentUserId)}
                    </TableCell>

                    <TableCell className="py-4 text-[14px] text-[#6B7280] h-[72px]">
                      {formatDateLabel(profile.created_at)}
                    </TableCell>

                    <TableCell className="py-4 pr-6 text-right h-[72px]">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6B7280] opacity-0 transition-colors hover:bg-[#F3F4F6] hover:text-[#111827] focus:opacity-100 data-[state=open]:opacity-100 group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          side="bottom"
                          align="end"
                          className="min-w-[160px] border border-[#E5E7EB] bg-white p-1 shadow-md rounded-lg"
                        >
                          <DropdownMenuItem className="cursor-pointer px-2.5 py-2 text-[13px] text-[#111827] focus:bg-[#F3F4F6]">
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer px-2.5 py-2 text-[13px] text-[#111827] focus:bg-[#F3F4F6]">
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer px-2.5 py-2 text-[13px] text-[#111827] focus:bg-[#F3F4F6]">
                            Suspend User
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[#E5E7EB]" />
                          <DropdownMenuItem className="cursor-pointer px-2.5 py-2 text-[13px] text-[#EF4444] focus:bg-[#FEF2F2] focus:text-[#EF4444]">
                            Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}

              {filteredProfiles.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="px-6 py-24 text-center">
                    <div className="mx-auto max-w-sm flex flex-col items-center">
                      <div className="h-12 w-12 rounded-full bg-[#FAFAFA] border border-[#E5E7EB] flex items-center justify-center mb-4">
                        <Search className="h-5 w-5 text-[#6B7280]" />
                      </div>
                      <p className="text-[16px] font-[600] text-[#111827]">
                        No users matched your filters
                      </p>
                      <p className="mt-1 text-[14px] text-[#6B7280]">
                        Try a different search term or clear the active filters.
                      </p>
                      <div className="mt-6">
                        <Button
                          variant="outline"
                          className="h-10 px-5 text-[14px] border-[#E5E7EB] text-[#111827] hover:bg-[#FAFAFA] rounded-lg shadow-sm"
                          onClick={() => {
                            setQuery("");
                            setRoleFilter("all");
                            setStatusFilter("all");
                            setSort("recent");
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
