"use client";

import { createContext, useContext } from "react";
import { DEFAULT_MENUS, type StoreMenus } from "@/lib/menus";

const MenuContext = createContext<StoreMenus | null>(null);

export function MenuProvider({
  menus,
  children,
}: {
  menus: StoreMenus;
  children: React.ReactNode;
}) {
  return <MenuContext.Provider value={menus}>{children}</MenuContext.Provider>;
}

// The current store's navigation. Falls back to defaults outside the provider.
export function useMenus(): StoreMenus {
  return useContext(MenuContext) ?? DEFAULT_MENUS;
}
