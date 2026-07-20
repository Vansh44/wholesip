"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { getFirebaseAuth, endSession } from "@/lib/auth/firebase-client";
import { getMyCustomer, type MyCustomer } from "@/app/actions/customer-profile";

type Customer = MyCustomer;

// Provider-agnostic identity exposed to consumers (maps the Firebase User's
// uid/email/phoneNumber onto the id/email/phone the storefront reads), so no
// consumer needs to know which auth provider is behind it.
export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

function toAuthUser(u: FirebaseUser | null): AuthUser | null {
  return u ? { id: u.uid, email: u.email, phone: u.phoneNumber } : null;
}

type AuthContextType = {
  user: AuthUser | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Reads the signed-in customer's own row via a server action (the browser
  // can't use the server-only Drizzle layer). Resolves identity server-side
  // from the session cookie, so no user id needs threading in.
  const fetchCustomer = useCallback(async () => {
    const data = await getMyCustomer();
    setCustomer(data);
  }, []);

  // Resolve from the *live* Firebase session rather than the `user` React state.
  // Right after the modal verifies + establishes the session cookie it calls
  // this before onAuthStateChanged has propagated, so reading currentUser
  // directly keeps both bits of state in sync.
  const refreshCustomer = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    setUser(toAuthUser(current));
    if (current) {
      await fetchCustomer();
    } else {
      setCustomer(null);
    }
  }, [fetchCustomer]);

  useEffect(() => {
    let active = true;

    // Fires once on mount with the restored session (or null), then on every
    // sign-in / sign-out. Firebase's listener has no re-entrancy lock, so it's
    // safe to kick off the async customer fetch straight from the callback.
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (fbUser) => {
      if (!active) return;
      setUser(toAuthUser(fbUser));
      if (fbUser) {
        fetchCustomer();
      } else {
        setCustomer(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [fetchCustomer]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const signOut = useCallback(async () => {
    // Clear local UI state immediately so the header updates without waiting on
    // the network, then tear down both the client session and the server cookie.
    setUser(null);
    setCustomer(null);
    await endSession();
  }, []);

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
