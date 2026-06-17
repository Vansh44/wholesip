"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteUser } from "@/app/actions/invite-user";
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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export function InviteUserDialog({
  className,
  label = "Add User",
}: {
  className?: string;
  label?: string;
  size?: "default" | "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }

    const formData = new FormData();
    formData.set("firstName", firstName.trim());
    formData.set("lastName", lastName.trim());
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
        setFirstName("");
        setLastName("");
        setEmail("");
        setRole("member");
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={className}>
        <UserPlus className="h-4 w-4" />
        {label}
      </DialogTrigger>
      <DialogContent className="gap-6 p-8 sm:max-w-[520px] overflow-y-auto max-h-[90vh]">
        <DialogHeader className="space-y-2 p-0">
          <DialogTitle className="text-[20px] font-semibold">
            Invite user
          </DialogTitle>
          <p className="text-muted-foreground text-[14px]">
            Send an invitation to a new team member.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invite-first-name"
                className="text-[14px] font-medium"
              >
                First name <span className="text-[var(--dash-red)]">*</span>
              </Label>
              <Input
                id="invite-first-name"
                type="text"
                placeholder="John"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPending}
                className="h-11 px-3 text-[14px]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invite-last-name"
                className="text-[14px] font-medium"
              >
                Last name
              </Label>
              <Input
                id="invite-last-name"
                type="text"
                placeholder="Doe (optional)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
                className="h-11 px-3 text-[14px]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email" className="text-[14px] font-medium">
              Email address <span className="text-[var(--dash-red)]">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="h-11 px-3 text-[14px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role" className="text-[14px] font-medium">
              Role <span className="text-[var(--dash-red)]">*</span>
            </Label>
            <Select
              value={role}
              onValueChange={(val) => setRole(val ?? "member")}
              disabled={isPending}
            >
              <SelectTrigger id="invite-role" className="h-11 px-3 text-[14px]">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Admin</SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="rounded-md border border-[var(--dash-red)]/30 bg-[var(--dash-red)]/10 px-4 py-3">
              <p className="text-[14px] font-medium text-[var(--dash-red)]">
                {error}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send invite"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
