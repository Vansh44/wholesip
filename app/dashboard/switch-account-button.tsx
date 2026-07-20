"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { endSession } from "@/lib/auth/firebase-client";

/**
 * Escape hatch on the "no access to this dashboard" screen. The visitor is
 * signed in as an account that isn't staff of THIS store, and wants to sign in
 * as someone else. A plain link to /auth/login can't do it: proxy.ts redirects
 * an already-authenticated user away from /auth/login straight back to
 * /dashboard — i.e. this same screen (the loop the button appeared to have).
 * So we must SIGN OUT first — clear the Firebase client SDK AND the
 * .storemink.com session cookie — and only then land on the login page.
 */
export function SwitchAccountButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    await endSession();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-block rounded-lg bg-[#E5E4E2] px-5 py-2.5 text-sm font-semibold text-[#111827] transition-colors duration-200 hover:bg-[#CFCFCF] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Switch account"}
    </button>
  );
}
