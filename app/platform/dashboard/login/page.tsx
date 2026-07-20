"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import {
  getFirebaseAuth,
  establishSession,
  firebaseAuthErrorMessage,
} from "@/lib/auth/firebase-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEY = "sm_operator_email_for_signin";

// Platform-operator login (storemink.com/dashboard/login). Passwordless email-
// link sign-in (Identity Platform); access to the console is then gated by
// platform_admins membership.
export default function OperatorLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Complete sign-in when the page is opened from the emailed link.
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    (async () => {
      setBusy(true);
      let addr = window.localStorage.getItem(EMAIL_KEY) ?? "";
      if (!addr) {
        addr = window.prompt("Confirm your email to finish signing in") ?? "";
      }
      if (!addr) {
        setBusy(false);
        setError("Enter the email you requested the link with.");
        return;
      }
      try {
        await signInWithEmailLink(auth, addr, window.location.href);
        window.localStorage.removeItem(EMAIL_KEY);
        const sessErr = await establishSession();
        if (sessErr) {
          setBusy(false);
          setError(sessErr);
          return;
        }
        router.replace("/dashboard");
        router.refresh();
      } catch (err) {
        setBusy(false);
        setError(firebaseAuthErrorMessage(err));
      }
    })();
  }, [router]);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) return setError("Enter a valid email.");
    setBusy(true);
    setError("");
    try {
      await sendSignInLinkToEmail(getFirebaseAuth(), email.trim(), {
        url: window.location.href,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_KEY, email.trim());
      setStep("sent");
    } catch (err) {
      setError(firebaseAuthErrorMessage(err));
    }
    setBusy(false);
  }

  return (
    <div className="stq-auth-wrap">
      <form className="stq-auth" onSubmit={sendLink}>
        <Link href="/" className="stq-logo" style={{ fontSize: 20 }}>
          Stor<span>eMink</span>
        </Link>
        <h1 style={{ marginTop: 18 }}>Operator login</h1>
        <p className="sub">
          {step === "email"
            ? "Sign in to the StoreMink admin console."
            : `We emailed a sign-in link to ${email}. Open it on this device to continue.`}
        </p>

        {step === "email" && (
          <>
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

            <button
              type="submit"
              className="stq-btn stq-btn-primary stq-btn-block"
              disabled={busy}
            >
              {busy ? "Please wait…" : "Email me a sign-in link"}
            </button>
          </>
        )}

        {error && (
          <div className="stq-hint bad" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
