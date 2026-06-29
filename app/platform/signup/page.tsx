"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  checkStoreSlugAvailability,
  type SlugCheck,
} from "@/app/actions/store-signup";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storiq.in";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: SlugCheck };

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // Debounced live availability check as the user types the store name.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!name.trim()) {
      setCheck({ status: "idle" });
      return;
    }
    setCheck({ status: "checking" });
    const mySeq = ++seq.current;
    timer.current = setTimeout(async () => {
      const result = await checkStoreSlugAvailability(name);
      // Ignore out-of-order responses.
      if (mySeq === seq.current) setCheck({ status: "done", result });
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [name]);

  const slug =
    check.status === "done" ? check.result.slug : "";
  const available = check.status === "done" && check.result.available;
  const phoneDigits = phone.replace(/\D/g, "");
  const canSubmit =
    EMAIL_RE.test(email) && phoneDigits.length >= 10 && available;

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // OTP verification + store provisioning is wired in the next step.
    alert(
      `Looks good! Next we'll OTP-verify ${email} and ${phone}, then create ${slug}.${ROOT_DOMAIN}.`,
    );
  }

  function hint() {
    if (check.status === "idle")
      return { cls: "neutral", text: `your-store.${ROOT_DOMAIN}` };
    if (check.status === "checking")
      return { cls: "neutral", text: "Checking availability…" };
    const r = check.result;
    if (r.available)
      return { cls: "ok", text: `${r.slug}.${ROOT_DOMAIN} is available ✓` };
    return { cls: "bad", text: r.reason ?? "Not available" };
  }
  const h = hint();

  return (
    <div className="stq-auth-wrap">
      <form className="stq-auth" onSubmit={onCreate}>
        <Link href="/" className="stq-logo" style={{ fontSize: 20 }}>
          Stor<span>iq</span>
        </Link>
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
              onChange={(e) => setName(e.target.value)}
            />
            <span className="stq-suffix">.{ROOT_DOMAIN}</span>
          </div>
          <div className={`stq-hint ${h.cls}`}>{h.text}</div>
        </div>

        <button
          type="submit"
          className="stq-btn stq-btn-primary stq-btn-block"
          disabled={!canSubmit}
        >
          Create store
        </button>

        <p className="stq-alt">
          Already selling on Storiq? <Link href="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
