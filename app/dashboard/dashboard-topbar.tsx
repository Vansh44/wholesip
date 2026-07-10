"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Search, Eye, Menu, MessageSquare } from "lucide-react";
import { TopbarProfile } from "./topbar-profile";
import { useMobileNav } from "./dashboard-mobile-nav";
import { useChat } from "./chat-context";

export function DashboardTopbar({
  email,
  role,
  firstName,
  lastName,
}: {
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const { setOpen } = useMobileNav();
  const { isChatOpen, toggleChat } = useChat();

  return (
    <header className="dash-topbar flex items-center justify-between px-4 h-14 bg-[#1a1a1a] text-white">
      <div className="flex items-center gap-4 min-w-[200px]">
        <button
          type="button"
          className="dash-icon-btn dash-nav-toggle md:hidden text-white hover:bg-white/10"
          aria-label="Open navigation menu"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
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
        </div>
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

        <button className="hidden sm:flex items-center gap-2 text-[#a3a3a3] hover:text-white bg-[#303030] hover:bg-[#3a3a3a] h-[34px] px-3 rounded-lg text-[13px] font-medium transition-colors">
          <Eye className="h-4 w-4" />
          View as
        </button>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 min-w-[200px] justify-end">
        <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded bg-[#333333] hover:bg-[#404040] cursor-pointer transition-colors text-[#a3a3a3] hover:text-white">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14.5 3h-13c-.28 0-.5.22-.5.5v9c0 .28.22.5.5.5h13c.28 0 .5-.22.5-.5v-9c0-.28-.22-.5-.5-.5zm-1.5 8h-10v-6h10v6z"></path>
            <path d="M4.5 6.5h2v2h-2zM8.5 6.5h2v2h-2z"></path>
          </svg>
        </div>
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
        />
      </div>
    </header>
  );
}
