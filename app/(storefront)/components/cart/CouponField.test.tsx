/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

// CartProvider pulls the storefront coupon validator (a "use server" module);
// mock it so we drive the apply-coupon path without a network/Supabase round-trip.
vi.mock("@/app/actions/coupon-actions", () => ({ validateCoupon: vi.fn() }));

// CouponField surfaces apply/remove feedback through sonner toasts.
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CartProvider, { useCart } from "./CartProvider";
import CouponField from "./CouponField";
import { validateCoupon } from "@/app/actions/coupon-actions";
import { toast } from "sonner";

// Seeds the cart with one item so subtotal > 0 (required for a coupon to be
// "valid"). Mirrors the Harness pattern from CartProvider.test.tsx — the
// CouponField itself has no add-to-cart UI.
function CartSeeder({ price }: { price: number }) {
  const cart = useCart();
  return (
    <button
      onClick={() =>
        cart.addItem({
          productId: "p1",
          slug: "soap",
          name: "Soap",
          variantId: null,
          variantName: null,
          price,
          basePrice: price,
          image: null,
        })
      }
    >
      seed
    </button>
  );
}

function renderField({ seedPrice }: { seedPrice?: number } = {}) {
  return render(
    <CartProvider>
      {seedPrice != null && <CartSeeder price={seedPrice} />}
      <CouponField />
    </CartProvider>,
  );
}

const PCT_COUPON = {
  code: "SAVE10",
  discountType: "percentage" as const,
  discountValue: 10,
  minOrderAmount: 0,
  description: null,
};

describe("CouponField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders the input + Apply button; Apply is disabled until something is typed", async () => {
    const user = userEvent.setup();
    renderField();

    const input = screen.getByPlaceholderText("Coupon code");
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(input).toBeInTheDocument();
    expect(apply).toBeDisabled();

    await user.type(input, "X");
    expect(apply).toBeEnabled();
  });

  it("uppercases typed input", async () => {
    const user = userEvent.setup();
    renderField();

    const input = screen.getByPlaceholderText("Coupon code") as HTMLInputElement;
    await user.type(input, "save10");
    expect(input).toHaveValue("SAVE10");
  });

  it("applies a valid code: toasts success, clears input, shows the applied view", async () => {
    const user = userEvent.setup();
    vi.mocked(validateCoupon).mockResolvedValue({ coupon: PCT_COUPON } as any);
    renderField({ seedPrice: 200 });

    await user.click(screen.getByText("seed")); // subtotal 200
    await user.type(screen.getByPlaceholderText("Coupon code"), "save10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.success).toHaveBeenCalledWith("Coupon applied");
    expect(toast.error).not.toHaveBeenCalled();
    // Switched to the applied view: code shown, input gone.
    expect(screen.getByText("SAVE10")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Coupon code")).not.toBeInTheDocument();
    // 10% of 200 = 20.
    expect(screen.getByText("You save ₹20")).toBeInTheDocument();
  });

  it("rejects an invalid code: toasts the error and stays on the input view", async () => {
    const user = userEvent.setup();
    vi.mocked(validateCoupon).mockResolvedValue({ error: "Expired." } as any);
    renderField();

    await user.type(screen.getByPlaceholderText("Coupon code"), "nope");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(toast.error).toHaveBeenCalledWith("Expired.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Coupon code")).toBeInTheDocument();
  });

  it("pressing Enter in the input applies the coupon", async () => {
    const user = userEvent.setup();
    vi.mocked(validateCoupon).mockResolvedValue({ coupon: PCT_COUPON } as any);
    renderField({ seedPrice: 200 });

    await user.click(screen.getByText("seed"));
    const input = screen.getByPlaceholderText("Coupon code");
    await user.type(input, "save10{Enter}");

    expect(validateCoupon).toHaveBeenCalledWith("SAVE10", 200);
    expect(toast.success).toHaveBeenCalledWith("Coupon applied");
    expect(screen.getByText("SAVE10")).toBeInTheDocument();
  });

  it("the ✕ remove button returns to the input view", async () => {
    const user = userEvent.setup();
    vi.mocked(validateCoupon).mockResolvedValue({ coupon: PCT_COUPON } as any);
    renderField({ seedPrice: 200 });

    await user.click(screen.getByText("seed"));
    await user.type(screen.getByPlaceholderText("Coupon code"), "save10");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText("You save ₹20")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove coupon" }));
    expect(screen.getByPlaceholderText("Coupon code")).toBeInTheDocument();
    expect(screen.queryByText("SAVE10")).not.toBeInTheDocument();
  });

  it("shows the min-order note when an applied coupon's minimum isn't met", async () => {
    const user = userEvent.setup();
    vi.mocked(validateCoupon).mockResolvedValue({
      coupon: { ...PCT_COUPON, minOrderAmount: 500 },
    } as any);
    // No cart items -> subtotal 0 -> below the 500 minimum -> couponValid false.
    renderField();

    await user.type(screen.getByPlaceholderText("Coupon code"), "save10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByText("Add ₹500 min order to use this")).toBeInTheDocument();
    expect(screen.queryByText(/You save/)).not.toBeInTheDocument();
  });
});
