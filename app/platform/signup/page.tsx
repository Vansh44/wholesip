"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  checkStoreSlugAvailability,
  createStore,
  getSignupResumeInfo,
  type SlugCheck,
} from "@/app/actions/store-signup";
import {
  startSignupSubscription,
  confirmSignupSubscription,
} from "@/app/actions/subscription-actions";
import { openRazorpaySubscriptionModal } from "@/lib/payments/razorpay-client";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import {
  THEME_META,
  THEME_CATEGORIES,
  DEFAULT_THEME_ID,
  type ThemeCategory,
} from "@/lib/themes/meta";
import { PLAN_META, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { customPhoneLabels } from "@/lib/phone-labels";
import { CountrySelect } from "@/components/ui/phone-country-select";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storemink.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BillingPeriod = "monthly" | "yearly";

// Steps in flow order. "password" is the second screen of the Account stage.
type Step =
  | "email"
  | "password"
  | "phone"
  | "name"
  | "store"
  | "theme"
  | "plan"
  | "creating";

// Progress stages shown in the stepper (Account folds email+password).
const STAGES = ["Account", "Phone", "You", "Store", "Theme", "Plan"] as const;
function stageOf(step: Step): number {
  switch (step) {
    case "email":
    case "password":
      return 0;
    case "phone":
      return 1;
    case "name":
      return 2;
    case "store":
      return 3;
    case "theme":
      return 4;
    default:
      return 5; // plan / creating
  }
}

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: SlugCheck };

function demoUrl(demoSlug: string): string {
  const { hostname, protocol, port } = window.location;
  return hostname.endsWith("localhost")
    ? `${protocol}//${demoSlug}.localhost${port ? ":" + port : ""}`
    : `https://${demoSlug}.${ROOT_DOMAIN}`;
}

function dashboardUrl(slug: string): string {
  const { hostname, protocol, port } = window.location;
  return hostname.endsWith("localhost")
    ? `${protocol}//${slug}.localhost${port ? ":" + port : ""}/dashboard`
    : `https://${slug}.${ROOT_DOMAIN}/dashboard`;
}

// Short marketing bullets per plan (derived from the plan catalog; kept concise
// for the signup card, not the full feature matrix).
const PLAN_BULLETS: Record<Plan, string[]> = {
  free: [
    "Free .storemink.com address",
    "Up to 25 products",
    "Cash on delivery",
    "1 staff account",
  ],
  basic: [
    "Everything in Free, plus:",
    "Connect a custom domain",
    "Online payments (Razorpay)",
    "Up to 500 products · 3 staff",
  ],
  pro: [
    "Everything in Basic, plus:",
    "Unlimited products & staff",
    "Email marketing campaigns",
    "Highest AI limits",
  ],
};

export default function SignupPage() {
  const supabase = useMemo(() => createClient(), []);

  const [step, setStep] = useState<Step>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Phone
  const [phone, setPhone] = useState<string | undefined>("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);

  // You
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Store + location
  const [name, setName] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [city, setCity] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // Theme
  const [template, setTemplate] = useState<string>(DEFAULT_THEME_ID);
  const [themeFilter, setThemeFilter] = useState<ThemeCategory | "all">("all");

  // Plan
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan>("free");

  // The store, once provisioned (a paid plan creates it before payment, so an
  // abandoned payment doesn't recreate/duplicate the store on retry).
  const [createdStoreId, setCreatedStoreId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  // On mount: resume after a Google redirect / refreshed tab. An account with a
  // session but no store jumps to phone (or name, if phone already verified);
  // an account that already owns a store goes to its dashboard.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    (async () => {
      const oauthErr = new URLSearchParams(window.location.search).get("error");
      if (oauthErr) setError(oauthErr);
      const info = await getSignupResumeInfo();
      if (!info.authenticated) return;
      if (info.hasStore && info.slug) {
        window.location.href = dashboardUrl(info.slug);
        return;
      }
      if (info.email) setEmail(info.email);
      if (info.firstName) setFirstName(info.firstName);
      if (info.lastName) setLastName(info.lastName);
      setStep(info.phoneConfirmed ? "name" : "phone");
    })();
  }, []);

  // ── Slug availability (store step) ───────────────────────────────────────
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
  const isNameAvailable = check.status === "done" && check.result.available;
  const currentSlug =
    check.status === "done"
      ? check.result.slug
      : name.trim()
        ? name.trim().toLowerCase().replace(/\s+/g, "-")
        : "your-store";
  function slugHint() {
    if (check.status === "idle")
      return { cls: "neutral", text: `your-store.${ROOT_DOMAIN}` };
    if (check.status === "checking")
      return { cls: "neutral", text: "Checking availability…" };
    const r = check.result;
    return r.available
      ? { cls: "ok", text: `${r.slug}.${ROOT_DOMAIN} is available ✓` }
      : { cls: "bad", text: r.reason ?? "Not available" };
  }

  // ── Account ──────────────────────────────────────────────────────────────
  function continueFromEmail() {
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setStep("password");
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    // The proxy rewrites /auth/callback → /platform/auth/callback on the
    // platform host; that route exchanges the code and returns to /signup,
    // where the mount effect resumes the wizard.
    const redirectTo = `${window.location.origin}/auth/callback?next=/signup`;
    const { error: oErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oErr) {
      setGoogleLoading(false);
      setError(oErr.message);
    }
  }

  async function handleCreateAccount() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: sErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    // Happy path: with "Confirm email" OFF, signUp returns a session at once.
    if (data.session) {
      setBusy(false);
      setStep("phone");
      return;
    }
    // No session from signUp — either the account already exists (Supabase
    // returns an obfuscated user with no session), or "Confirm email" is still
    // ON. Try signing in with the same credentials: this recovers a returning
    // (or auto-confirmed) account so the wizard can resume at the phone step.
    const signIn = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signIn.data.session) {
      setStep("phone");
      return;
    }
    if (signIn.error && /confirm/i.test(signIn.error.message)) {
      setError(
        "This project still requires email confirmation. Turn off “Confirm email” in Supabase Auth (Authentication → Providers → Email) to enable phone-only signup.",
      );
    } else if (
      (sErr && /already|registered/i.test(sErr.message)) ||
      signIn.error
    ) {
      setError(
        "An account with this email already exists. Log in, or use a different email.",
      );
    } else {
      setError("Couldn't start your session. Please try again.");
    }
  }

  // ── Phone ────────────────────────────────────────────────────────────────
  async function handleSendPhoneOtp() {
    if (!phone || !isValidPhoneNumber(phone)) {
      setError("Enter a valid phone number.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: pErr } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (pErr) return setError(pErr.message);
    setPhoneSent(true);
  }

  async function handleVerifyPhoneOtp() {
    if (!phone) return;
    setBusy(true);
    setError("");
    const { error: vErr } = await supabase.auth.verifyOtp({
      phone,
      token: phoneCode.trim(),
      type: "phone_change",
    });
    if (vErr) {
      setBusy(false);
      return setError(vErr.message);
    }
    setBusy(false);
    setStep("name");
  }

  // ── Finalize (plan step) ───────────────────────────────────────────────────
  // Creates the store once (on free), then — for a paid plan — opens the
  // Razorpay autopay mandate and activates the plan on success. An abandoned
  // payment leaves a working Free store the merchant can upgrade later.
  async function ensureStore(): Promise<{
    storeId: string;
    slug: string;
  } | null> {
    if (createdStoreId && createdSlug) {
      return { storeId: createdStoreId, slug: createdSlug };
    }
    const res = await createStore({
      name,
      template,
      firstName,
      lastName,
      country,
      city,
    });
    if (res.error || !res.storeId || !res.slug) {
      setError(res.error ?? "Could not create your store.");
      return null;
    }
    setCreatedStoreId(res.storeId);
    setCreatedSlug(res.slug);
    return { storeId: res.storeId, slug: res.slug };
  }

  async function finalize() {
    setBusy(true);
    setError("");

    if (selectedPlan === "free") {
      setStep("creating");
      const store = await ensureStore();
      if (!store) {
        setBusy(false);
        setStep("plan");
        return;
      }
      window.location.href = dashboardUrl(store.slug);
      return;
    }

    // Paid: provision the store, then collect the autopay mandate.
    const store = await ensureStore();
    if (!store) {
      setBusy(false);
      return;
    }

    const start = await startSignupSubscription(
      store.storeId,
      selectedPlan,
      period,
    );
    if ("error" in start) {
      setBusy(false);
      setError(start.error);
      return;
    }

    const opened = await openRazorpaySubscriptionModal({
      keyId: start.keyId,
      subscriptionId: start.subscriptionId,
      name: "StoreMink",
      description: `${start.planName} plan — ${period} autopay`,
      prefill: {
        name: `${firstName} ${lastName}`.trim() || undefined,
        email: email || undefined,
        contact: phone || undefined,
      },
      onSuccess: async (res) => {
        await confirmSignupSubscription(
          store.storeId,
          res.razorpay_payment_id,
          res.razorpay_subscription_id,
          res.razorpay_signature,
        );
        // Whether or not confirm returns instantly, the webhook + the
        // dashboard's reconcile-on-read will finish activation. Head in.
        window.location.href = dashboardUrl(store.slug);
      },
      onDismiss: () => {
        setBusy(false);
        setError(
          "Payment wasn't completed. Retry, or continue on Free for now.",
        );
      },
    });
    if (!opened) {
      setBusy(false);
      setError("Couldn't open the payment window. Please try again.");
    }
  }

  const h = slugHint();
  const stage = stageOf(step);

  // Which steps show a Back control (and where it goes).
  const BACK: Partial<Record<Step, Step>> = {
    password: "email",
    store: "name",
    theme: "store",
    plan: "theme",
  };

  const wide = step === "theme" || step === "plan";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="font-bold text-xl text-gray-900 tracking-tight flex items-center"
        >
          Store<span className="text-primary">Mink</span>
        </Link>
        <p className="text-sm text-gray-500 font-medium">
          Already selling?{" "}
          <Link href="/platform/login" className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pt-8 pb-20">
        {/* Progress stepper */}
        {step !== "creating" && (
          <div className="w-full max-w-md mb-8">
            <div className="flex items-center gap-1.5">
              {STAGES.map((label, i) => (
                <div key={label} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      i <= stage ? "bg-primary" : "bg-gray-200"
                    }`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs font-medium text-gray-500">
              Step {stage + 1} of {STAGES.length} · {STAGES[stage]}
            </p>
          </div>
        )}

        <div className={`w-full ${wide ? "max-w-5xl" : "max-w-md"}`}>
          {error && (
            <div className="mb-6 p-3 rounded-md bg-red-50 text-red-600 text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          {/* ── Email ─────────────────────────────────────────────── */}
          {step === "email" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Start your free store
              </h1>
              <p className="text-gray-500 mb-8">
                Enter your email to create your StoreMink account.
              </p>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleLoading}
                className="w-full h-12 flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium text-gray-400">OR</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  continueFromEmail();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Email address
                  </label>
                  <input
                    type="email"
                    className="stq-input h-12"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                  />
                </div>
                <button
                  type="submit"
                  className="stq-btn stq-btn-primary w-full h-12 mt-6 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-gray-400 leading-relaxed">
                By continuing you agree to StoreMink&apos;s Terms and
                acknowledge our Privacy Policy.
              </p>
            </div>
          )}

          {/* ── Password ──────────────────────────────────────────── */}
          {step === "password" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Create a password
              </h1>
              <p className="text-gray-500 mb-8">
                Securing the account for{" "}
                <span className="font-medium text-gray-700">{email}</span>.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateAccount();
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="stq-input h-12 pr-11"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoFocus
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Use 8 or more characters.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={busy || password.length < 8}
                  className="stq-btn stq-btn-primary w-full h-12 mt-6 flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Continue <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── Phone ─────────────────────────────────────────────── */}
          {step === "phone" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Verify your phone
              </h1>
              <p className="text-gray-500 mb-8">
                We&apos;ll text a one-time code to confirm it&apos;s you.
              </p>

              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-gray-700">
                  Mobile number
                </label>
                <div className="flex gap-2">
                  <PhoneInput
                    defaultCountry="IN"
                    countrySelectComponent={CountrySelect}
                    labels={customPhoneLabels}
                    placeholder="Mobile number"
                    value={phone}
                    onChange={setPhone}
                    disabled={phoneSent}
                    numberInputProps={{ autoComplete: "tel-national" }}
                    className="stq-phone"
                  />
                  <button
                    type="button"
                    onClick={handleSendPhoneOtp}
                    disabled={busy || phoneSent || !phone}
                    className="stq-btn stq-btn-primary whitespace-nowrap text-sm px-4"
                  >
                    {phoneSent ? "Sent" : busy ? "…" : "Send OTP"}
                  </button>
                </div>

                {phoneSent && (
                  <div className="flex flex-col gap-2 pt-2 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-semibold text-gray-700">
                      Enter the 6-digit code
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="stq-input flex-1 h-12"
                        placeholder="6-digit code"
                        inputMode="numeric"
                        maxLength={6}
                        autoFocus
                        value={phoneCode}
                        onChange={(e) =>
                          setPhoneCode(e.target.value.replace(/\D/g, ""))
                        }
                      />
                      <button
                        type="button"
                        onClick={handleVerifyPhoneOtp}
                        disabled={busy || phoneCode.length < 6}
                        className="stq-btn stq-btn-primary whitespace-nowrap px-5"
                      >
                        {busy ? "…" : "Verify"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPhoneSent(false);
                        setPhoneCode("");
                        setError("");
                      }}
                      className="text-xs text-gray-500 hover:text-primary text-left mt-1"
                    >
                      ← Wrong number? Edit and resend
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Name ──────────────────────────────────────────────── */}
          {step === "name" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                What&apos;s your name?
              </h1>
              <p className="text-gray-500 mb-8">
                This is how we&apos;ll address you in your dashboard.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!firstName.trim()) {
                    setError("Enter your first name.");
                    return;
                  }
                  setError("");
                  setStep("store");
                }}
                className="flex flex-col gap-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      First name
                    </label>
                    <input
                      className="stq-input h-12"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoFocus
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      Last name{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      className="stq-input h-12"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="stq-btn stq-btn-primary w-full h-12 mt-2 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* ── Store + location ──────────────────────────────────── */}
          {step === "store" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Name your store
              </h1>
              <p className="text-gray-500 mb-8">
                You can change this later — the address is yours to keep.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!isNameAvailable) return;
                  setError("");
                  setStep("theme");
                }}
                className="flex flex-col gap-5"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-gray-700">
                    Store name
                  </label>
                  <input
                    className="stq-input h-12 text-lg"
                    placeholder="E.g., My Awesome Store"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    autoFocus
                    maxLength={50}
                  />
                  <div className={`stq-hint !mt-1 ${h.cls}`}>{h.text}</div>
                </div>

                {/* Live subdomain chip */}
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 font-mono">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" />
                  https://{currentSlug}.{ROOT_DOMAIN}
                </div>

                {/* Location — where the merchant sells from */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      Where do you sell from?
                    </label>
                    <select
                      className="stq-input h-12 bg-white"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-semibold text-gray-700">
                      City{" "}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <input
                      className="stq-input h-12"
                      placeholder="E.g., Mumbai"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      maxLength={80}
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-white text-xl shadow-sm">
                    🎉
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-indigo-900">
                      Free lifetime domain
                    </h4>
                    <p className="mt-0.5 text-xs font-medium text-indigo-700">
                      Your .storemink.com address is free forever.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!isNameAvailable}
                  className="stq-btn stq-btn-primary w-full h-12 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* ── Theme ─────────────────────────────────────────────── */}
          {step === "theme" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Choose a store theme
              </h1>
              <p className="text-gray-500 mb-6">
                Pick a starting look for {name.trim() ? name : "your store"} —
                you can customise everything later.
              </p>

              <div className="mb-6 flex flex-wrap gap-2">
                {THEME_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setThemeFilter(c.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                      themeFilter === c.id
                        ? "border-primary bg-primary text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-primary/50"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {THEME_META.filter(
                  (t) => themeFilter === "all" || t.category === themeFilter,
                ).map((t) => {
                  const selected = template === t.id;
                  const locked = !!t.minPlan; // signup provisions plan "free"
                  return (
                    <div
                      key={t.id}
                      onClick={() => !locked && setTemplate(t.id)}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all ${
                        locked
                          ? "cursor-not-allowed opacity-70"
                          : "cursor-pointer"
                      } ${
                        selected
                          ? "border-primary ring-2 ring-primary ring-offset-2"
                          : "border-gray-200 hover:border-primary/50 hover:shadow-md"
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden border-b bg-gray-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.previewImage}
                          alt={t.name}
                          className="h-full w-full object-cover"
                        />
                        {selected && (
                          <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
                            <div className="rounded-full bg-white p-1 shadow-md">
                              <CheckCircle2 className="h-6 w-6 text-primary" />
                            </div>
                          </div>
                        )}
                        {locked && (
                          <span className="absolute right-2 top-2 rounded-full bg-gray-900/80 px-2.5 py-1 text-[11px] font-bold text-white">
                            {t.minPlan!.toUpperCase()}+ plan
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {t.name}
                          </h3>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                demoUrl(t.demoSlug),
                                "_blank",
                                "noopener,noreferrer",
                              );
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:border-primary/50 hover:text-primary"
                          >
                            Preview <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="line-clamp-2 h-8 text-xs text-gray-500">
                          {t.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setStep("plan")}
                className="stq-btn stq-btn-primary w-full h-12 max-w-md flex items-center justify-center gap-2"
              >
                Continue <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* ── Plan ──────────────────────────────────────────────── */}
          {step === "plan" && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-300">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                Choose your plan
              </h1>
              <p className="text-gray-500 mb-6">
                Start free — upgrade any time. Paid plans unlock custom domains
                and online payments.
              </p>

              {/* Billing period toggle */}
              <div className="mb-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
                {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                      period === p
                        ? "bg-primary text-white"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {p}
                    {p === "yearly" && (
                      <span
                        className={`ml-1.5 text-[11px] ${period === "yearly" ? "text-white/80" : "text-emerald-600"}`}
                      >
                        2 months free
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {(["free", "basic", "pro"] as Plan[]).map((planId) => {
                  const meta = PLAN_META[planId];
                  const limits = PLAN_LIMITS[planId];
                  const selected = selectedPlan === planId;
                  const priceInr =
                    period === "yearly" ? meta.yearlyInr : meta.monthlyInr;
                  return (
                    <div
                      key={planId}
                      onClick={() => setSelectedPlan(planId)}
                      className={`relative cursor-pointer rounded-xl border-2 bg-white p-5 shadow-sm transition-all ${
                        selected
                          ? "border-primary ring-2 ring-primary ring-offset-2"
                          : "border-gray-200 hover:border-primary/50 hover:shadow-md"
                      }`}
                    >
                      {planId === "basic" && (
                        <span className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                          Popular
                        </span>
                      )}
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-gray-900">
                          {meta.name}
                        </h3>
                        {selected && (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="mt-2 mb-1">
                        {priceInr === 0 ? (
                          <span className="text-2xl font-extrabold text-gray-900">
                            Free
                          </span>
                        ) : (
                          <>
                            <span className="text-2xl font-extrabold text-gray-900">
                              ₹{priceInr.toLocaleString("en-IN")}
                            </span>
                            <span className="text-sm text-gray-500">
                              /{period === "yearly" ? "yr" : "mo"}
                            </span>
                          </>
                        )}
                      </div>
                      <p className="mb-4 h-8 text-xs text-gray-500">
                        {meta.tagline}
                      </p>
                      <ul className="flex flex-col gap-2">
                        {PLAN_BULLETS[planId].map((b) => (
                          <li
                            key={b}
                            className="flex items-start gap-2 text-sm text-gray-600"
                          >
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            {b}
                          </li>
                        ))}
                      </ul>
                      {limits.removeBadge && (
                        <p className="mt-3 text-[11px] font-medium text-gray-400">
                          No “Powered by StoreMink” badge
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={finalize}
                disabled={busy}
                className="stq-btn stq-btn-primary w-full h-12 max-w-md flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : selectedPlan === "free" ? (
                  "Create my store"
                ) : (
                  `Subscribe to ${PLAN_META[selectedPlan].name} & continue`
                )}
              </button>

              {createdStoreId && createdSlug && selectedPlan !== "free" && (
                <button
                  type="button"
                  onClick={() =>
                    (window.location.href = dashboardUrl(createdSlug))
                  }
                  className="mt-3 w-full max-w-md text-center text-sm font-medium text-gray-500 hover:text-primary"
                >
                  Continue on Free for now →
                </button>
              )}
            </div>
          )}

          {/* ── Creating ──────────────────────────────────────────── */}
          {step === "creating" && (
            <div className="mt-16 flex flex-col items-center text-center">
              <Loader2 className="mb-6 h-12 w-12 animate-spin text-primary" />
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
                Creating {name || "your store"}…
              </h1>
              <p className="text-gray-500">
                Applying your theme and setting up your dashboard. Hang tight!
              </p>
            </div>
          )}

          {/* Back control */}
          {BACK[step] && step !== "creating" && (
            <button
              type="button"
              onClick={() => {
                setError("");
                setStep(BACK[step]!);
              }}
              className="stq-btn stq-btn-ghost mt-6 flex items-center gap-1 font-medium"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
