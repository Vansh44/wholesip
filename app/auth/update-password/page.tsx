"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword } from "@/app/actions/user-management";
import { toast } from "sonner";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await changeOwnPassword(password);

    if (result.error) {
      setError(result.error);
    } else {
      toast.success("Password updated successfully");
      router.push("/dashboard");
    }
    setLoading(false);
  }

  return (
    <div className="w-full">
      <div className="mb-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          Update Password
        </h1>
        <p className="mt-2 text-sm text-[#6B7280]">
          Please enter your new password below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="font-medium">
            New Password
          </Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="h-10"
            minLength={6}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          className="w-full h-10 mt-2 font-medium"
          disabled={loading}
        >
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
