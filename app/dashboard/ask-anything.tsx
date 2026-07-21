"use client";

import { Sparkles } from "lucide-react";
import { useChat } from "./chat-context";

// The Home "Ask anything…" entry point. Opens the existing dashboard AI
// assistant (DashboardChat) — a clickable prompt rather than a text input, so
// there's no typed text that gets lost when the assistant panel opens.
export function AskAnything() {
  const { isChatOpen, toggleChat } = useChat();

  return (
    <button
      type="button"
      onClick={() => {
        if (!isChatOpen) toggleChat();
      }}
      className="group flex w-full items-center gap-3 rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] px-4 py-3.5 text-left shadow-[var(--dash-shadow-xs)] transition-colors hover:border-[var(--dash-accent)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dash-accent-soft)] text-[var(--dash-accent)]">
        <Sparkles className="h-4 w-4" />
      </span>
      <span className="flex-1 text-[15px] text-[var(--dash-text-3)]">
        Ask anything…
      </span>
      <span className="hidden text-[12px] font-medium text-[var(--dash-text-3)] sm:inline">
        AI assistant
      </span>
    </button>
  );
}
