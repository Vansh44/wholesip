"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/app/actions/invite-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

export function InviteUserDialog({
  className,
  label = "Add User",
  size = "sm",
}: {
  className?: string;
  label?: string;
  size?: "default" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const formData = new FormData();
    formData.set("email", email);
    formData.set("role", role);

    startTransition(async () => {
      const result = await inviteUser(formData);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Invitation sent", {
          description: `An invite has been sent to ${email}`,
        });
        setOpen(false);
        setEmail("");
        setRole("member");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className={className} size={size} />}>
        <UserPlus className="mr-2 h-4 w-4" />
        {label}
      </DialogTrigger>
      <DialogContent className="gap-6 rounded-[16px] border border-[#E5E7EB] bg-white p-8 shadow-xl sm:max-w-[520px]">
        <DialogHeader className="space-y-2 p-0">
          <DialogTitle className="text-[20px] font-[600] text-[#111827]">
            Invite User
          </DialogTitle>
          <p className="text-[14px] text-[#6B7280]">
            Send an invitation to a new team member.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="invite-email"
              className="text-[14px] font-medium text-[#111827]"
            >
              Email Address
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="h-[48px] rounded-[10px] border-[#E5E7EB] bg-white px-3 text-[14px] text-[#111827] focus-visible:ring-[#0F172A] shadow-sm placeholder:text-[#6B7280]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="invite-role"
              className="text-[14px] font-medium text-[#111827]"
            >
              Role
            </Label>
            <Select
              value={role}
              onValueChange={(val) => setRole(val ?? "member")}
              disabled={isPending}
            >
              <SelectTrigger
                id="invite-role"
                className="h-[48px] rounded-[10px] border-[#E5E7EB] bg-white px-3 text-[14px] text-[#111827] focus-visible:ring-[#0F172A] shadow-sm"
              >
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent className="rounded-[10px] border-[#E5E7EB] shadow-lg">
                <SelectItem value="member" className="py-2.5">
                  Member
                </SelectItem>
                <SelectItem value="superadmin" className="py-2.5">
                  Owner
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-[10px] bg-[#FEF2F2] border border-[#FCA5A5] px-4 py-3">
              <p className="text-[14px] text-[#EF4444] font-medium">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-10 rounded-[8px] border border-[#E5E7EB] bg-white text-[#111827] hover:bg-[#FAFAFA] hover:text-[#111827] px-4 font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="h-10 rounded-[8px] bg-[#0F172A] text-white hover:bg-[#1E293B] px-5 font-medium shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send Invite"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
