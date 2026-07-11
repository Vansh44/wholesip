"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface ChatContextType {
  isChatOpen: boolean;
  toggleChat: () => void;
  closeChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Stable identities + memoized value: this provider wraps the whole dashboard,
  // so an unstable value object would re-render every consumer on any re-render
  // (a real cost once chat state grows beyond a single boolean).
  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);
  const value = useMemo(
    () => ({ isChatOpen, toggleChat, closeChat }),
    [isChatOpen, toggleChat, closeChat],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    // Defensive default so a stray consumer never crashes the shell — the
    // shared DashboardTopbar is also rendered by the platform console layout,
    // which intentionally has no ChatProvider (the assistant is a store-only
    // feature). Mirrors useMobileNav's non-throwing fallback.
    return {
      isChatOpen: false,
      toggleChat: () => {},
      closeChat: () => {},
    };
  }
  return context;
}
