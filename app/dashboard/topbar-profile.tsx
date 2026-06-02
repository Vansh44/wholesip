"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0]?.replace(/[0-9]+$/g, "") ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "Admin";
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function shortName(email: string) {
  const full = displayNameFromEmail(email);
  const parts = full.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }
  const single = parts[0] ?? "Admin";
  if (single.length <= 14) return single;
  return `${single.slice(0, 12)}…`;
}

function initialsFromEmail(email: string) {
  const name = displayNameFromEmail(email);
  const bits = name.split(" ").filter(Boolean);
  if (bits.length >= 2) {
    return `${bits[0][0]}${bits[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function TopbarProfile({
  email,
  role,
}: {
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = displayNameFromEmail(email);
  const short = shortName(email);
  const initials = initialsFromEmail(email);
  const roleLabel = role === "superadmin" ? "Superadmin" : "Admin";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[var(--dash-border)] bg-[var(--dash-surface-2)] py-1 pl-1 pr-2 transition-all hover:border-[var(--dash-border-hover)] hover:bg-[var(--dash-surface-3)]"
      >
        <div
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--dash-accent), var(--dash-accent-2))",
          }}
        >
          {initials}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-[12.5px] font-medium leading-tight text-[var(--dash-text)]">
            {short}
          </div>
          <div className="text-[10px] text-[var(--dash-text-3)]">
            {roleLabel}
          </div>
        </div>
        <span className="hidden pr-0.5 text-[11px] text-[var(--dash-text-3)] sm:inline">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-[200] w-[200px] overflow-hidden rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface-2)] shadow-[0_20px_40px_rgba(0,0,0,0.4)]">
          <div className="border-b border-[var(--dash-border)] px-3.5 py-3">
            <div className="text-[13px] font-semibold">{name}</div>
            <div className="mt-0.5 text-[11px] text-[var(--dash-text-3)]">
              {email}
            </div>
          </div>
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2.5 text-[13px] text-[var(--dash-text-2)] hover:bg-[var(--dash-surface-3)] hover:text-[var(--dash-text)]"
          >
            ⚙️ &nbsp;Account Settings
          </Link>
          <div className="block cursor-default px-3.5 py-2.5 text-[13px] text-[var(--dash-text-2)]">
            🔑 &nbsp;Change Password
          </div>
          <div className="block cursor-default px-3.5 py-2.5 text-[13px] text-[var(--dash-text-2)]">
            📱 &nbsp;Update Phone
          </div>
          <div className="h-px bg-[var(--dash-border)]" />
          <button
            type="button"
            onClick={handleSignOut}
            className="block w-full px-3.5 py-2.5 text-left text-[13px] text-[var(--dash-red)] hover:bg-[var(--dash-red-soft)]"
          >
            🚪 &nbsp;Log Out
          </button>
        </div>
      )}
    </div>
  );
}
