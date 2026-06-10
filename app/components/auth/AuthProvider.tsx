"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Customer = {
  id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string | null;
  updated_at: string;
};

type AuthContextType = {
  user: User | null;
  customer: Customer | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const supabase = createClient();

  const fetchCustomer = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("customers")
        .select("*")
        .eq("id", userId)
        .single();
      setCustomer(data);
    },
    [supabase],
  );

  const refreshCustomer = useCallback(async () => {
    if (user) {
      await fetchCustomer(user.id);
    }
  }, [user, fetchCustomer]);

  useEffect(() => {
    let active = true;

    // Initial session check
    const init = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUser(currentUser);
      if (currentUser) {
        await fetchCustomer(currentUser.id);
      }
      setLoading(false);
    };
    init();

    // Listen for auth state changes.
    // IMPORTANT: this callback runs *synchronously while the auth client holds
    // its internal lock*. Calling another Supabase method (e.g. fetchCustomer,
    // which queries the DB) with `await` here can dead-lock the client — the UI
    // then gets stuck until a refresh, and a later signOut() hangs waiting for
    // the same lock. So keep the callback sync and defer DB work off the lock.
    // See @supabase/auth-js GoTrueClient onAuthStateChange remarks.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        setTimeout(() => {
          if (active) fetchCustomer(sessionUser.id);
        }, 0);
      } else {
        setCustomer(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchCustomer]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const signOut = useCallback(async () => {
    // Clear local UI state immediately so the header updates without waiting on
    // the network. `scope: "local"` revokes only this session locally, avoiding
    // a slow/hanging server round-trip; any error is swallowed so logout always
    // completes from the user's point of view.
    setUser(null);
    setCustomer(null);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Already cleared local state above; nothing else to do.
    }
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        customer,
        loading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        signOut,
        refreshCustomer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
