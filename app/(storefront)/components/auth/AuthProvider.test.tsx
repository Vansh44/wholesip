/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// AuthProvider builds its Supabase client from the browser factory (auth calls
// only) and reads the customer row via the getMyCustomer server action; mock
// both so we can drive auth state + the customer fetch without a real client.
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/app/actions/customer-profile", () => ({ getMyCustomer: vi.fn() }));

import AuthProvider, { useAuth } from "./AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { getMyCustomer } from "@/app/actions/customer-profile";

// ---------------------------------------------------------------------------
// Mock wiring.
//
// The source calls:
//   supabase.auth.getUser()                            (init + refreshCustomer)
//   supabase.auth.onAuthStateChange(cb) -> { data: { subscription } }
//   supabase.auth.signOut({ scope })
//   getMyCustomer() -> the customer row (server action, identity server-side)
//
// `currentUser` / `customerRow` are mutable so individual tests can flip what
// getUser / getMyCustomer resolve to between renders or calls.
// ---------------------------------------------------------------------------

let currentUser: any;
let customerRow: any;
let authCallback: ((event: string, session: any) => void) | null;
const unsubscribe = vi.fn();
let signOutMock: ReturnType<typeof vi.fn>;
let supabase: any;

function buildClient() {
  signOutMock = vi.fn().mockResolvedValue({ error: null });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: currentUser } })),
      onAuthStateChange: vi.fn((cb: (e: string, s: any) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
      signOut: signOutMock,
    },
  };
}

const USER = { id: "u-1", phone: "+15551234567" } as any;
const CUSTOMER = {
  id: "u-1",
  phone: "+15551234567",
  email: "a@b.com",
  first_name: "Ada",
  last_name: "Lovelace",
  updated_at: "2026-01-01",
};

// Consumer that surfaces the auth context as test-readable DOM + buttons.
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
    vi.useRealTimers();
    currentUser = null;
    customerRow = null;
    authCallback = null;
    supabase = buildClient();
    vi.mocked(createClient).mockReturnValue(supabase);
    // Reads the mutable customerRow at call time, so tests can flip it.
    vi.mocked(getMyCustomer).mockImplementation(async () => customerRow);
  });

  it("useAuth throws when used outside the provider", () => {
    function Bare() {
      useAuth();
      return null;
    }
    // Silence the expected React error boundary log.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/useAuth must be used within/);
    spy.mockRestore();
  });

  it("initial load with no session settles loading=false and a null user", async () => {
    renderAuth();
    expect(screen.getByTestId("loading")).toHaveTextContent("true");

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("user")).toHaveTextContent("");
    expect(screen.getByTestId("customer")).toHaveTextContent("");
    expect(getMyCustomer).not.toHaveBeenCalled();
  });

  it("initial load with a session populates the user and fetches the customer row", async () => {
    currentUser = USER;
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

  it("signOut calls supabase.auth.signOut and clears user + customer", async () => {
    const user = userEvent.setup();
    currentUser = USER;
    customerRow = CUSTOMER;
    renderAuth();

    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByTestId("user")).toHaveTextContent("u-1");

    await user.click(screen.getByText("signOut"));

    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("");
      expect(screen.getByTestId("customer")).toHaveTextContent("");
    });
  });

  it("onAuthStateChange SIGNED_IN populates the user (and SIGNED_OUT clears it)", async () => {
    customerRow = CUSTOMER;
    renderAuth();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(authCallback).toBeTypeOf("function");

    // The callback defers fetchCustomer via setTimeout(0); flush real timers.
    await act(async () => {
      authCallback!("SIGNED_IN", { user: USER });
    });
    expect(screen.getByTestId("user")).toHaveTextContent("u-1");
    await waitFor(() =>
      expect(screen.getByTestId("customer")).toHaveTextContent("Ada"),
    );

    await act(async () => {
      authCallback!("SIGNED_OUT", null);
    });
    expect(screen.getByTestId("user")).toHaveTextContent("");
    expect(screen.getByTestId("customer")).toHaveTextContent("");
  });

  it("refreshCustomer re-fetches and surfaces the updated customer", async () => {
    const user = userEvent.setup();
    currentUser = USER;
    customerRow = CUSTOMER;
    renderAuth();
    expect(await screen.findByText("Ada")).toBeInTheDocument();

    // Flip what getUser/single resolve to, then refresh.
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
