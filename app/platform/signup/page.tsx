"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  checkStoreSlugAvailability,
  createStore,
  type SlugCheck,
} from "@/app/actions/store-signup";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storiq.in";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// To E.164 (+countrycode...). Bare 10-digit numbers are assumed Indian (+91).
function normalizePhone(p: string): string {
  const raw = p.replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91")) return `+${digits}`;
  return `+${digits}`;
}

function dashboardUrl(slug: string): string {
  const { hostname, protocol, port } = window.location;
  return hostname.endsWith("localhost")
    ? `${protocol}//${slug}.localhost${port ? ":" + port : ""}/dashboard`
    : `https://${slug}.${ROOT_DOMAIN}/dashboard`;
}

type Step = "form" | "email" | "phone" | "creating";
type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: SlugCheck };

export default function SignupPage() {
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // Debounced live store-name availability check. Driven from the input's
  // onChange (an event handler) rather than an effect, so we never call
  // setState synchronously inside an effect body.
  function onNameChange(value: string) {
    setName(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    const mySeq = ++seq.current;
    timer.current = setTimeout(async () => {
      const result = await checkStoreSlugAvailability(value);
      if (mySeq === seq.current) setCheck({ status: "done", result });
    }, 400);
  }

  const available = check.status === "done" && check.result.available;
  const phoneDigits = phone.replace(/\D/g, "");
  const canStart =
    EMAIL_RE.test(email) && phoneDigits.length >= 10 && available && !busy;

  // Step 1 → send the email OTP (creates the owner account on verify).
  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(error.message);
    setCode("");
    setStep("email");
  }

  // Step 2 → verify email code, then send the phone OTP.
  async function verifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    if (vErr) {
      setBusy(false);
      return setError(vErr.message);
    }
    const { error: pErr } = await supabase.auth.updateUser({
      phone: normalizePhone(phone),
    });
    setBusy(false);
    if (pErr) return setError(pErr.message);
    setCode("");
    setStep("phone");
  }

  // Step 3 → verify phone code, then provision the store.
  async function verifyPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: vErr } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: code.trim(),
      type: "phone_change",
    });
    if (vErr) {
      setBusy(false);
      return setError(vErr.message);
    }
    setStep("creating");
    const res = await createStore(name);
    if (res.error || !res.slug) {
      setBusy(false);
      setStep("phone");
      return setError(res.error ?? "Could not create your store.");
    }
    window.location.href = dashboardUrl(res.slug);
  }

  function hint() {
    if (check.status === "idle")
      return { cls: "neutral", text: `your-store.${ROOT_DOMAIN}` };
    if (check.status === "checking")
      return { cls: "neutral", text: "Checking availability…" };
    const r = check.result;
    return r.available
      ? { cls: "ok", text: `${r.slug}.${ROOT_DOMAIN} is available ✓` }
      : { cls: "bad", text: r.reason ?? "Not available" };
  }
  const h = hint();

  return (
    <div className="stq-auth-wrap">
      <form
        className="stq-auth"
        onSubmit={
          step === "form"
            ? startSignup
            : step === "email"
              ? verifyEmail
              : verifyPhone
        }
      >
        <Link href="/" className="stq-logo" style={{ fontSize: 20 }}>
          Stor<span>iq</span>
        </Link>

        {step === "form" && (
          <>
            <h1 style={{ marginTop: 18 }}>Create your store</h1>
            <p className="sub">Launch your D2C brand in minutes.</p>

            <div className="stq-field">
              <label className="stq-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                className="stq-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="stq-field">
              <label className="stq-label" htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                className="stq-input"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="stq-field">
              <label className="stq-label" htmlFor="store">
                Store name
              </label>
              <div className="stq-input-row">
                <input
                  id="store"
                  className="stq-input"
                  placeholder="Your Store"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                />
                <span className="stq-suffix">.{ROOT_DOMAIN}</span>
              </div>
              <div className={`stq-hint ${h.cls}`}>{h.text}</div>
            </div>

            <button
              type="submit"
              className="stq-btn stq-btn-primary stq-btn-block"
              disabled={!canStart}
            >
              {busy ? "Sending code…" : "Create store"}
            </button>
          </>
        )}

        {(step === "email" || step === "phone") && (
          <>
            <h1 style={{ marginTop: 18 }}>
              {step === "email" ? "Verify your email" : "Verify your phone"}
            </h1>
            <p className="sub">
              Enter the 6-digit code sent to{" "}
              <strong>
                {step === "email" ? email : normalizePhone(phone)}
              </strong>
              .
            </p>
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
            <button
              type="submit"
              className="stq-btn stq-btn-primary stq-btn-block"
              disabled={busy || code.length < 4}
            >
              {busy
                ? "Verifying…"
                : step === "email"
                  ? "Verify email"
                  : "Verify & create store"}
            </button>
          </>
        )}

        {step === "creating" && (
          <>
            <h1 style={{ marginTop: 18 }}>Setting up your store…</h1>
            <p className="sub">Hang tight — taking you to your dashboard.</p>
          </>
        )}

        {error && (
          <div className="stq-hint bad" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <p className="stq-alt">
          Already selling on Storiq? <Link href="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
