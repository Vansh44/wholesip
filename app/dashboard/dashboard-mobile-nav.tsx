"use client";

import { createContext, useContext, useState } from "react";

type MobileNavCtx = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<MobileNavCtx | null>(null);

// Shares the mobile nav-drawer open/closed state between the topbar (which owns
// the hamburger trigger) and the sidebar (which renders as a slide-in drawer on
// small screens). On desktop the sidebar is always in-flow and this state is
// simply ignored.
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, setOpen, toggle: () => setOpen(!open) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileNav(): MobileNavCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Defensive default so a stray consumer never crashes the shell.
    return { open: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}
