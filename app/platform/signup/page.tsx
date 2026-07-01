"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  checkStoreSlugAvailability,
  createStore,
  type SlugCheck,
} from "@/app/actions/store-signup";
import { CheckCircle2, ChevronRight, ChevronLeft, Lock, Loader2, Check, Globe } from "lucide-react";
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storemink.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TEMPLATES = [
  {
    id: "arcade",
    name: "Arcade",
    description: "Simplistic and pleasing design for modern stores.",
    img: "https://placehold.co/600x400/1f7a5a/ffffff?text=Arcade",
    color: "bg-[#1f7a5a]",
  },
  {
    id: "fresko",
    name: "Fresko",
    description: "Minimal yet alluring theme for high quality brands.",
    img: "https://placehold.co/600x400/2a9d8f/ffffff?text=Fresko",
    color: "bg-[#2a9d8f]",
  },
  {
    id: "emporio",
    name: "Emporio",
    description: "Energizing theme featuring extensive design layouts.",
    img: "https://placehold.co/600x400/e76f51/ffffff?text=Emporio",
    color: "bg-[#e76f51]",
  },
];

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

type Step = "name" | "theme" | "details" | "creating";
type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: SlugCheck };

export default function SignupPage() {
  const supabase = useMemo(() => createClient(), []);

  // Wizard Steps
  const [step, setStep] = useState<Step>("name");
  const [template, setTemplate] = useState<string>("arcade");

  // Step 1: Name
  const [name, setName] = useState("");
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // Step 3: Details & Auth
  const [email, setEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [password, setPassword] = useState("");
  const [repassword, setRepassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Step 1 Check
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
  const currentSlug = check.status === "done" ? check.result.slug : (name.trim() ? name.trim().toLowerCase().replace(/\s+/g, '-') : "your-store");

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
  const selectedThemeInfo = TEMPLATES.find(t => t.id === template) || TEMPLATES[0];

  // Step 3 Logic
  async function handleSendEmailOtp() {
    if (!EMAIL_RE.test(email) || password.length < 6) {
      setError("Enter a valid email and a password (min 6 chars) first.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setEmailSent(true);
    }
  }

  async function handleVerifyEmailOtp() {
    setBusy(true);
    setError("");
    let { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: emailCode.trim(),
      type: "signup",
    });
    if (vErr) {
      const { error: vErr2 } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: emailCode.trim(),
        type: "email",
      });
      if (vErr2) {
        setBusy(false);
        return setError(vErr.message);
      }
    }
    setEmailVerified(true);
    setBusy(false);
  }

  async function handleSendPhoneOtp() {
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setError("Enter a valid phone number.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: pErr } = await supabase.auth.updateUser({
      phone: normalizePhone(phone),
    });
    setBusy(false);
    if (pErr) return setError(pErr.message);
    setPhoneSent(true);
  }

  async function handleVerifyPhoneOtp() {
    setBusy(true);
    setError("");
    const { error: vErr } = await supabase.auth.verifyOtp({
      phone: normalizePhone(phone),
      token: phoneCode.trim(),
      type: "phone_change",
    });
    if (vErr) {
      setBusy(false);
      return setError(vErr.message);
    }
    setPhoneVerified(true);
    setBusy(false);
  }

  async function handleCreateStore() {
    if (!emailVerified || !phoneVerified) {
      setError("Please verify both email and phone.");
      return;
    }
    if (password !== repassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setStep("creating");

    const res = await createStore(name, template);
    if (res.error || !res.slug) {
      setBusy(false);
      setStep("details");
      return setError(res.error ?? "Could not create your store.");
    }
    window.location.href = dashboardUrl(res.slug);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl text-gray-900 tracking-tight flex items-center">
          Store<span className="text-primary">mink</span>
        </Link>
        <p className="text-sm text-gray-500 font-medium">
          Already selling? <Link href="/platform/login" className="text-primary hover:underline">Log in</Link>
        </p>
      </header>

      <main className="flex-1 flex flex-col items-center pt-10 pb-20 px-4">
        {(step === "name" || step === "theme") && (
          <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-12 items-start mt-10">
            
            {/* Left side: Dynamic Content */}
            <div className="w-full lg:w-[600px] flex flex-col pt-4">
              
              {step === "name" && (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Store details</h1>
                  <p className="text-gray-500 mb-10 text-lg">Give your store a name.</p>
                  
                  <div className="stq-field mb-8 relative">
                    <label className="stq-label text-sm font-semibold text-gray-700" htmlFor="store">
                      Store name
                    </label>
                    <div className="stq-input-row mt-2">
                      <input
                        id="store"
                        className="stq-input h-12 text-lg"
                        placeholder="E.g., My Awesome Store"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        autoFocus
                      />
                      <span className="text-sm text-gray-400 absolute right-3 top-[44px]">
                        {name.length}/50
                      </span>
                    </div>
                    <div className="flex flex-col mt-2">
                      <div className={`stq-hint !mt-0 ${h.cls} mb-4`}>{h.text}</div>
                      
                      <div className="mt-2 flex items-center gap-3 bg-indigo-50/80 border border-indigo-200 rounded-xl p-3 shadow-sm w-full">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm border border-indigo-100 text-xl">
                          🎉
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-indigo-900">Free Lifetime Domain!</h4>
                          <p className="text-xs font-medium text-indigo-700 mt-0.5">Avail a custom .storemink.com address forever.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10">
                    <button
                      onClick={() => setStep("theme")}
                      disabled={!isNameAvailable}
                      className="stq-btn stq-btn-primary w-full h-12 text-lg flex items-center justify-center gap-2"
                    >
                      Next <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {step === "theme" && (
                <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Choose a store theme</h1>
                  <p className="text-gray-500 mb-8 text-lg">Select a beautiful layout for {name.trim() ? name : "your store"}.</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                    {TEMPLATES.map((t) => {
                      const selected = template === t.id;
                      return (
                        <div
                          key={t.id}
                          onClick={() => setTemplate(t.id)}
                          className={`group relative rounded-xl border-2 transition-all cursor-pointer overflow-hidden bg-white shadow-sm ${
                            selected ? "border-primary ring-2 ring-primary ring-offset-2" : "border-gray-200 hover:border-primary/50 hover:shadow-md"
                          }`}
                        >
                          <div className="aspect-[4/3] w-full overflow-hidden bg-gray-100 border-b relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={t.img} alt={t.name} className="w-full h-full object-cover" />
                            {selected && (
                              <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                                <div className="bg-white rounded-full p-1 shadow-md">
                                  <CheckCircle2 className="w-6 h-6 text-primary" />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">{t.name}</h3>
                            <p className="text-xs text-gray-500 mb-3 h-8 line-clamp-2">{t.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between w-full">
                    <button
                      onClick={() => setStep("name")}
                      className="stq-btn stq-btn-ghost h-12 px-6 font-medium flex items-center gap-1"
                    >
                      <ChevronLeft className="w-5 h-5" /> Back
                    </button>
                    <button
                      onClick={() => setStep("details")}
                      className="stq-btn stq-btn-primary flex items-center gap-2 h-12 px-8 text-lg"
                    >
                      Next <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: Browser Mockup (Sticky) */}
            <div className="hidden lg:flex w-full lg:flex-1 p-8 rounded-2xl bg-gradient-to-br from-green-100 via-emerald-50 to-blue-100 items-center justify-center min-h-[500px] sticky top-10 shadow-inner border border-gray-200/50">
              <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200 flex flex-col">
                
                {/* Browser Toolbar */}
                <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-4">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                    <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                    <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                  </div>
                  <div className="flex-1 bg-white border border-gray-200 rounded-md py-1.5 px-3 flex items-center justify-center">
                    <span className="text-xs text-gray-500 font-mono flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-600" />
                      https://{currentSlug}.{ROOT_DOMAIN}
                    </span>
                  </div>
                </div>

                {/* Mockup Content */}
                <div className="p-6 bg-white min-h-[350px] transition-all duration-300">
                  <div className={`flex items-center justify-between mb-8 ${template === 'fresko' ? 'flex-col gap-4' : ''}`}>
                    <div className="font-bold text-xl text-gray-800">
                      {name.trim() ? name : "Your Store"}
                    </div>
                    <div className="flex gap-4">
                      <div className="h-4 w-12 bg-gray-200 rounded-full"></div>
                      <div className="h-4 w-12 bg-gray-200 rounded-full"></div>
                    </div>
                  </div>
                  
                  {/* Dynamic Layout based on theme */}
                  <div className={`w-full h-48 rounded-xl mb-6 transition-colors duration-500 ${selectedThemeInfo.color} opacity-90`}></div>
                  
                  <div className={`grid gap-6 ${template === 'emporio' ? 'grid-cols-2' : template === 'fresko' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    <div className="h-32 bg-gray-100 rounded-xl"></div>
                    <div className="h-32 bg-gray-100 rounded-xl"></div>
                    {(template === 'arcade' || template === 'fresko') && (
                      <div className="h-32 bg-gray-100 rounded-xl"></div>
                    )}
                    {template === 'fresko' && (
                      <div className="h-32 bg-gray-100 rounded-xl"></div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="w-full max-w-md mx-auto mt-10">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">Your Details</h1>
            <p className="text-gray-500 mb-8">Secure your superadmin account for <strong>{name}</strong>.</p>
            
            {error && (
              <div className="mb-6 p-3 rounded-md bg-red-50 text-red-600 text-sm font-medium border border-red-100">
                {error}
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 flex flex-col gap-6">
              
              {/* Email Section */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-semibold text-gray-700">Email Address</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    className="stq-input flex-1"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={emailVerified || emailSent}
                  />
                  {!emailVerified && (
                    <button 
                      type="button"
                      onClick={handleSendEmailOtp}
                      disabled={busy || emailSent || !email}
                      className="stq-btn stq-btn-primary whitespace-nowrap text-sm px-4"
                    >
                      {emailSent ? "Sent" : "Send OTP"}
                    </button>
                  )}
                  {emailVerified && (
                    <div className="flex items-center px-3 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
                      <Check className="w-5 h-5" />
                    </div>
                  )}
                </div>
                
                {emailSent && !emailVerified && (
                  <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                    <input
                      type="text"
                      className="stq-input flex-1"
                      placeholder="6-digit code"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
                    />
                    <button 
                      type="button"
                      onClick={handleVerifyEmailOtp}
                      disabled={busy || emailCode.length < 6}
                      className="stq-btn stq-btn-primary whitespace-nowrap text-sm px-4"
                    >
                      Verify
                    </button>
                  </div>
                )}
              </div>

              {/* Password Section (Need it early to signUp with email) */}
              {!emailVerified && (
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-gray-700">Set Password</label>
                  <p className="text-xs text-gray-500 -mt-2">Required before sending email OTP</p>
                  <input
                    type="password"
                    className="stq-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={emailVerified}
                  />
                </div>
              )}

              {/* Phone Section (Requires Email Verified First) */}
              {emailVerified && (
                <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                  <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      className="stq-input flex-1"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={phoneVerified || phoneSent}
                    />
                    {!phoneVerified && (
                      <button 
                        type="button"
                        onClick={handleSendPhoneOtp}
                        disabled={busy || phoneSent || !phone}
                        className="stq-btn stq-btn-primary whitespace-nowrap text-sm px-4"
                      >
                        {phoneSent ? "Sent" : "Send OTP"}
                      </button>
                    )}
                    {phoneVerified && (
                      <div className="flex items-center px-3 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">
                        <Check className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {phoneSent && !phoneVerified && (
                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-2">
                      <input
                        type="text"
                        className="stq-input flex-1"
                        placeholder="6-digit code"
                        maxLength={6}
                        value={phoneCode}
                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ""))}
                      />
                      <button 
                        type="button"
                        onClick={handleVerifyPhoneOtp}
                        disabled={busy || phoneCode.length < 6}
                        className="stq-btn stq-btn-primary whitespace-nowrap text-sm px-4"
                      >
                        Verify
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Passwords for creation confirmation */}
              {emailVerified && (
                <div className="flex flex-col gap-4 pt-4 border-t border-gray-100">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-700">Password</label>
                    <input
                      type="password"
                      className="stq-input bg-gray-50 text-gray-500"
                      value="••••••••"
                      disabled
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-gray-700">Retype Password</label>
                    <input
                      type="password"
                      className="stq-input"
                      placeholder="••••••••"
                      value={repassword}
                      onChange={(e) => setRepassword(e.target.value)}
                    />
                  </div>
                </div>
              )}

            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                onClick={() => setStep("theme")}
                className="stq-btn stq-btn-ghost flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={handleCreateStore}
                disabled={busy || !emailVerified || !phoneVerified || !repassword || password !== repassword}
                className="stq-btn stq-btn-primary px-8"
              >
                Create Store
              </button>
            </div>
          </div>
        )}

        {step === "creating" && (
          <div className="w-full max-w-md mx-auto mt-20 flex flex-col items-center text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-6" />
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 mb-2">Creating {name}…</h1>
            <p className="text-gray-500">Applying your chosen theme and setting up your dashboard. Hang tight!</p>
          </div>
        )}

      </main>
    </div>
  );
}
