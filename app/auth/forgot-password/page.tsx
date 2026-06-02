"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { triggerPasswordReset } from "@/app/actions/user-management";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await triggerPasswordReset(email);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="w-full text-center">
        <h1 className="text-xl font-semibold tracking-tight text-primary mb-4">
          Check your email
        </h1>
        <p className="text-sm text-[#6B7280] mb-8">
          We sent a password reset link to{" "}
          <span className="font-medium text-[#111827]">{email}</span>.
        </p>
        <Button
          onClick={() => router.push("/auth/login")}
          variant="outline"
          className="w-full h-10 font-medium"
        >
          Back to log in
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-primary">
          Forgot Password
        </h1>
        <p className="mt-2 text-sm text-[#6B7280]">
          Enter your email address and we will send you a link to reset your
          password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="font-medium">
            Email address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="h-10"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="submit"
          className="w-full h-10 mt-2 font-medium"
          disabled={loading}
        >
          {loading ? "Sending link…" : "Reset password"}
        </Button>
      </form>
    </div>
  );
}
