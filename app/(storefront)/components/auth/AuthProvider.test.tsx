/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// AuthProvider tracks the customer via Firebase onAuthStateChanged, reads the
// row via the getMyCustomer server action, and tears down via endSession. Mock
// all three seams so we can drive auth state without a real Firebase client.
vi.mock("firebase/auth", () => ({ onAuthStateChanged: vi.fn() }));
vi.mock("@/lib/auth/firebase-client", () => ({
  getFirebaseAuth: vi.fn(() => ({ currentUser: currentFbUser })),
  endSession: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/customer-profile", () => ({ getMyCustomer: vi.fn() }));

import AuthProvider, { useAuth } from "./AuthProvider";
import { onAuthStateChanged } from "firebase/auth";
import { endSession } from "@/lib/auth/firebase-client";
import { getMyCustomer } from "@/app/actions/customer-profile";

// ---------------------------------------------------------------------------
// Mock wiring. onAuthStateChanged stores the callback and fires it once with
// the current user (mimicking Firebase's initial resolve on mount); tests can
// re-fire it via `authCallback` to simulate later sign-in / sign-out.
// `currentFbUser` / `customerRow` are mutable so tests can flip them.
// ---------------------------------------------------------------------------

let currentFbUser: any;
let customerRow: any;
let authCallback: ((user: any) => void) | null;
const unsubscribe = vi.fn();

// A Firebase User carries uid / email / phoneNumber (AuthProvider maps these to
// id / email / phone for consumers).
const FB_USER = { uid: "u-1", email: "a@b.com", phoneNumber: "+15551234567" };
const CUSTOMER = {
  id: "u-1",
  phone: "+15551234567",
  email: "a@b.com",
  first_name: "Ada",
  last_name: "Lovelace",
  updated_at: "2026-01-01",
};

function Harness() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="user">{auth.user?.id ?? ""}</span>
      <span data-testid="customer">{auth.customer?.first_name ?? ""}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="modal">{String(auth.isAuthModalOpen)}</span>
      <button onClick={() => auth.openAuthModal()}>open</button>
      <button onClick={() => auth.closeAuthModal()}>close</button>
      <button onClick={() => auth.signOut()}>signOut</button>
      <button onClick={() => auth.refreshCustomer()}>refresh</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentFbUser = null;
    customerRow = null;
    authCallback = null;
    vi.mocked(getMyCustomer).mockImplementation(async () => customerRow);
    vi.mocked(onAuthStateChanged).mockImplementation((_auth: any, cb: any) => {
      authCallback = cb;
      cb(currentFbUser); // initial resolve (Firebase fires on mount)
      return unsubscribe as any;
    });
  });

  it("useAuth throws when used outside the provider", () => {
    function Bare() {
      useAuth();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useAuth must be used within/);
    spy.mockRestore();
  });

  it("initial load with no session settles loading=false and a null user", async () => {
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("");
    expect(screen.getByTestId("customer")).toHaveTextContent("");
    expect(getMyCustomer).not.toHaveBeenCalled();
  });

  it("initial load with a session populates the user and fetches the customer row", async () => {
    currentFbUser = FB_USER;
    customerRow = CUSTOMER;
    renderAuth();

    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByTestId("user")).toHaveTextContent("u-1");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(getMyCustomer).toHaveBeenCalled();
  });

  it("openAuthModal / closeAuthModal toggle isAuthModalOpen", async () => {
    const user = userEvent.setup();
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    expect(screen.getByTestId("modal")).toHaveTextContent("false");
    await user.click(screen.getByText("open"));
    expect(screen.getByTestId("modal")).toHaveTextContent("true");
    await user.click(screen.getByText("close"));
    expect(screen.getByTestId("modal")).toHaveTextContent("false");
  });

  it("signOut calls endSession and clears user + customer", async () => {
    const user = userEvent.setup();
    currentFbUser = FB_USER;
    customerRow = CUSTOMER;
    renderAuth();

    expect(await screen.findByText("Ada")).toBeInTheDocument();

    await user.click(screen.getByText("signOut"));

    expect(endSession).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("");
      expect(screen.getByTestId("customer")).toHaveTextContent("");
    });
  });

  it("onAuthStateChanged SIGNED_IN populates the user (and SIGNED_OUT clears it)", async () => {
    customerRow = CUSTOMER;
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(authCallback).toBeTypeOf("function");

    await act(async () => {
      authCallback!(FB_USER);
    });
    expect(screen.getByTestId("user")).toHaveTextContent("u-1");
    await waitFor(() =>
      expect(screen.getByTestId("customer")).toHaveTextContent("Ada"),
    );

    await act(async () => {
      authCallback!(null);
    });
    expect(screen.getByTestId("user")).toHaveTextContent("");
    expect(screen.getByTestId("customer")).toHaveTextContent("");
  });

  it("refreshCustomer re-fetches from the live session and surfaces the update", async () => {
    const user = userEvent.setup();
    currentFbUser = FB_USER;
    customerRow = CUSTOMER;
    renderAuth();
    expect(await screen.findByText("Ada")).toBeInTheDocument();

    customerRow = { ...CUSTOMER, first_name: "Grace" };
    await user.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(screen.getByTestId("customer")).toHaveTextContent("Grace"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("u-1");
  });

  it("unsubscribes from auth state changes on unmount", async () => {
    const { unmount } = renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(unsubscribe).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
