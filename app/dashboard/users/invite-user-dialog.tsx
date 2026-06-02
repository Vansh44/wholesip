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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
      <DialogTrigger className={className}>{label}</DialogTrigger>
      <DialogContent
        className="gap-6 p-8 shadow-xl sm:max-w-[520px] overflow-y-auto max-h-[90vh]"
        style={{
          backgroundColor: "#16181f",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#f0f2f5",
        }}
      >
        <DialogHeader className="space-y-2 p-0">
          <DialogTitle
            className="text-[20px] font-semibold"
            style={{ color: "#f0f2f5" }}
          >
            Invite User
          </DialogTitle>
          <p className="text-[14px]" style={{ color: "#8b90a0" }}>
            Send an invitation to a new team member.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invite-first-name"
                className="text-[14px] font-medium"
                style={{ color: "#f0f2f5" }}
              >
                First Name <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Input
                id="invite-first-name"
                type="text"
                placeholder="John"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPending}
                className="h-11 px-3 text-[14px] rounded-md"
                style={{
                  backgroundColor: "#0e1018",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f0f2f5",
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="invite-last-name"
                className="text-[14px] font-medium"
                style={{ color: "#f0f2f5" }}
              >
                Last Name
              </Label>
              <Input
                id="invite-last-name"
                type="text"
                placeholder="Doe (optional)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
                className="h-11 px-3 text-[14px] rounded-md"
                style={{
                  backgroundColor: "#0e1018",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f0f2f5",
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="invite-email"
              className="text-[14px] font-medium"
              style={{ color: "#f0f2f5" }}
            >
              Email Address <span style={{ color: "#ef4444" }}>*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="user@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="h-11 px-3 text-[14px] rounded-md"
              style={{
                backgroundColor: "#0e1018",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f0f2f5",
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label
              htmlFor="invite-role"
              className="text-[14px] font-medium"
              style={{ color: "#f0f2f5" }}
            >
              Role <span style={{ color: "#ef4444" }}>*</span>
            </Label>
            <Select
              value={role}
              onValueChange={(val) => setRole(val ?? "member")}
              disabled={isPending}
            >
              <SelectTrigger
                id="invite-role"
                className="h-11 px-3 text-[14px] rounded-md"
                style={{
                  backgroundColor: "#0e1018",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f0f2f5",
                }}
              >
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent
                style={{
                  backgroundColor: "#16181f",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0f2f5",
                }}
              >
                <SelectItem value="member">Admin</SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div
              className="rounded-md px-4 py-3"
              style={{
                border: "1px solid rgba(239,68,68,0.3)",
                backgroundColor: "rgba(239,68,68,0.08)",
              }}
            >
              <p
                className="text-[14px] font-medium"
                style={{ color: "#f87171" }}
              >
                {error}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="h-10 px-4 rounded-md text-[14px] font-medium transition-colors"
              style={{
                backgroundColor: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#8b90a0",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  "transparent";
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-10 px-5 rounded-md text-[14px] font-medium flex items-center transition-opacity"
              style={{
                backgroundColor: "#3b6ef5",
                color: "#ffffff",
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send Invite"
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
