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
import { getMyCustomer, type MyCustomer } from "@/app/actions/customer-profile";

type Customer = MyCustomer;

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

  // Reads the signed-in customer's own row via a server action (the browser
  // can't use the server-only Drizzle layer). Resolves identity server-side
  // from the session cookie, so no user id needs threading in.
  const fetchCustomer = useCallback(async () => {
    const data = await getMyCustomer();
    setCustomer(data);
  }, []);

  // Resolve the customer from the *live* session rather than the `user` React
  // state. Right after verifyOtp / profile-save the modal calls this before the
  // onAuthStateChange-driven setUser has propagated, so relying on `user` here
  // would no-op and leave the header signed-out until a manual refresh. Reading
  // getUser() directly avoids that race and keeps both bits of state in sync.
  const refreshCustomer = useCallback(async () => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    setUser(currentUser);
    if (currentUser) {
      await fetchCustomer();
    } else {
      setCustomer(null);
    }
  }, [supabase, fetchCustomer]);

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
        await fetchCustomer();
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
          if (active) fetchCustomer();
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
