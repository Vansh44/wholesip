"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Search, Store, Menu, MessageSquare } from "lucide-react";
import { TopbarProfile, formatRole } from "./topbar-profile";
import { useMobileNav } from "./dashboard-mobile-nav";
import { useChat } from "./chat-context";

// Plan pill styling on the dark topbar — neutral for free, brand-tinted as the
// plan climbs, mirroring the console's plan colours.
const PLAN_PILL: Record<string, string> = {
  free: "bg-white/10 text-[#d1d5db]",
  basic: "bg-sky-400/20 text-sky-200",
  pro: "bg-[#7F4AFA]/25 text-[#c9b8fb]",
};

export function DashboardTopbar({
  email,
  role,
  firstName,
  lastName,
  storeName,
  planId,
  planName,
}: {
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  // Store context (store dashboards only). Absent on the platform operator
  // console, which manages every store rather than one.
  storeName?: string;
  planId?: string;
  planName?: string;
}) {
  const { setOpen } = useMobileNav();
  const { isChatOpen, toggleChat } = useChat();
  const planPill = PLAN_PILL[planId ?? "free"] ?? PLAN_PILL.free;

  return (
    <header className="dash-topbar flex items-center justify-between px-4 h-14 bg-[#1a1a1a] text-white">
      <div className="flex items-center gap-3 min-w-[200px]">
        <button
          type="button"
          className="dash-icon-btn dash-nav-toggle md:hidden text-white hover:bg-white/10"
          aria-label="Open navigation menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link
          href="/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-80 transition-opacity"
        >
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-[#7F4AFA]/20">
            <Image
              src="/icon.svg"
              alt="StoreMink logo"
              width={20}
              height={20}
              className="h-5 w-5 object-contain"
            />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            StoreMink
          </span>
        </Link>

        {/* Store identity + plan (Shopify-style): which store you're managing
            and the plan it's on, right next to the product logo. Hidden on the
            platform console, which has no single store. */}
        {storeName && (
          <div className="hidden items-center gap-2 lg:flex">
            <span className="h-5 w-px bg-white/15" aria-hidden />
            <span
              className="max-w-[160px] truncate text-[13px] font-medium text-white/90"
              title={storeName}
            >
              {storeName}
            </span>
            {planName && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${planPill}`}
                title={`This store is on the ${planName} plan`}
              >
                {planName}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-1 justify-center max-w-xl">
        <div className="dash-search-bar hidden md:flex flex-1 max-w-md bg-[#303030] hover:bg-[#3a3a3a] transition-colors border border-transparent hover:border-[#444] rounded-lg h-[34px] px-3 items-center gap-2 group cursor-text">
          <Search className="h-4 w-4 shrink-0 text-[#a3a3a3] group-hover:text-white transition-colors" />
          <input
            type="search"
            placeholder="Search"
            className="flex-1 bg-transparent border-none outline-none text-white text-[13px] placeholder:text-[#a3a3a3]"
          />
          <kbd className="dash-search-kbd shrink-0 bg-[#404040] text-[#a3a3a3] text-[10px] font-medium px-1.5 py-0.5 rounded">
            ⌘ K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 min-w-[200px] justify-end">
        {/* The role this session is signed in with, next to My Store. */}
        <span className="hidden sm:inline-flex items-center rounded-full bg-white/10 px-2.5 h-[34px] text-[12.5px] font-medium text-white/85">
          {formatRole(role)}
        </span>
        <button
          type="button"
          onClick={() => window.open("/", "_blank")}
          className="hidden sm:flex items-center gap-2 text-[#a3a3a3] hover:text-white bg-[#303030] hover:bg-[#3a3a3a] h-[34px] px-3 rounded-lg text-[13px] font-medium transition-colors"
        >
          <Store className="h-4 w-4" />
          My Store
        </button>
        <button
          type="button"
          onClick={toggleChat}
          className={`dash-icon-btn relative text-[#a3a3a3] hover:text-white w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-white/10 ${isChatOpen ? "bg-white/10 text-white" : ""}`}
          aria-label="AI Assistant"
        >
          <MessageSquare className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          className="dash-icon-btn relative text-[#a3a3a3] hover:text-white w-8 h-8 rounded flex items-center justify-center transition-colors hover:bg-white/10"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-[5px] top-[4px] h-2 w-2 rounded-full bg-[#ff3b30] border border-[#1a1a1a]" />
        </button>
        <TopbarProfile
          email={email}
          role={role}
          firstName={firstName}
          lastName={lastName}
          storeName={storeName}
          planName={planName}
        />
      </div>
    </header>
  );
}
