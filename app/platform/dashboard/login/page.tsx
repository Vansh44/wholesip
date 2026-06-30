"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Platform-operator login (storemink.com/dashboard/login). Email OTP only —
// access to the console is then gated by platform_admins membership.
export default function OperatorLoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email.");
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="stq-auth-wrap">
      <form className="stq-auth" onSubmit={step === "email" ? sendCode : verify}>
        <Link href="/" className="stq-logo" style={{ fontSize: 20 }}>
          Stor<span>emink</span>
        </Link>
        <h1 style={{ marginTop: 18 }}>Operator login</h1>
        <p className="sub">
          {step === "email"
            ? "Sign in to the Storemink admin console."
            : `Enter the 6-digit code sent to ${email}.`}
        </p>

        {step === "email" ? (
          <div className="stq-field">
            <label className="stq-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="stq-input"
              placeholder="you@storemink.com"
              autoFocus
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
            />
          </div>
        ) : (
          <div className="stq-field">
            <label className="stq-label" htmlFor="code">
              Verification code
            </label>
            <input
              id="code"
              className="stq-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
            />
          </div>
        )}

        <button
          type="submit"
          className="stq-btn stq-btn-primary stq-btn-block"
          disabled={busy}
        >
          {busy
            ? "Please wait…"
            : step === "email"
              ? "Send code"
              : "Verify & continue"}
        </button>

        {error && (
          <div className="stq-hint bad" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
