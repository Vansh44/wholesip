"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useCart } from "@/app/(storefront)/components/cart/CartProvider";
import { placeOrder, CheckoutFormData } from "@/app/actions/checkout-actions";
import {
  getMyAddresses,
  saveAddress as saveAddressAction,
  deleteAddress,
  type SavedAddress,
} from "@/app/actions/address-actions";
import { useAuth } from "@/app/(storefront)/components/auth/AuthProvider";
import { formatPrice } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY_FORM: CheckoutFormData = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

export default function CheckoutPage() {
  const router = useRouter();
  const { customer, loading: authLoading, openAuthModal } = useAuth();
  const cart = useCart();

  const [loading, setLoading] = useState(false);
  // Set once the order is placed so clearing the cart below doesn't trip the
  // "cart empty → /shop" effect and steal the redirect to the success page.
  const orderPlaced = useRef(false);
  const [form, setForm] = useState<CheckoutFormData>(EMPTY_FORM);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  // Which saved address is selected (null = entering a new/edited address).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveForLater, setSaveForLater] = useState(true);

  const fillFormFromAddress = useCallback((a: SavedAddress) => {
    setForm((f) => ({
      firstName: a.first_name || f.firstName,
      lastName: a.last_name || f.lastName,
      email: a.email || f.email,
      phone: a.phone || f.phone,
      addressLine1: a.address_line1,
      addressLine2: a.address_line2 || "",
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      country: a.country || "India",
    }));
  }, []);

  // Not signed in → open the auth modal IN PLACE (no redirect). After sign-in
  // `customer` populates and the checkout form renders right here, so the click
  // the shopper already made carries through to checkout.
  useEffect(() => {
    if (!authLoading && !customer) openAuthModal();
  }, [authLoading, customer, openAuthModal]);

  // Prefill contact details from the account as a baseline.
  useEffect(() => {
    if (customer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm((f) => ({
        ...f,
        email: customer.email || f.email,
        phone: customer.phone || f.phone,
        firstName: customer.first_name || f.firstName,
        lastName: customer.last_name || f.lastName,
      }));
    }
  }, [customer]);

  // Load saved addresses; preselect the default so the shopper doesn't retype.
  useEffect(() => {
    if (!customer) return;
    let active = true;
    getMyAddresses().then((list) => {
      if (!active) return;
      setAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def) {
        setSelectedId(def.id);
        fillFormFromAddress(def);
      }
    });
    return () => {
      active = false;
    };
  }, [customer, fillFormFromAddress]);

  // Redirect if cart empty (but not when we just emptied it after a successful
  // order — that navigates to the success page instead).
  useEffect(() => {
    if (orderPlaced.current) return;
    if (cart.hydrated && cart.items.length === 0) {
      toast.info("Your cart is empty");
      router.push("/shop");
    }
  }, [cart.hydrated, cart.items.length, router]);

  if (authLoading || !cart.hydrated) {
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <p className="text-muted-foreground">Loading checkout...</p>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 pt-[120px] text-center">
        <h1 className="text-2xl font-bold">Sign in to continue</h1>
        <p className="max-w-sm text-muted-foreground">
          Please sign in to review your order and check out — your cart is
          saved.
        </p>
        <Button size="lg" onClick={openAuthModal}>
          Sign in
        </Button>
      </main>
    );
  }

  if (cart.items.length === 0) {
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <p className="text-muted-foreground">Loading checkout...</p>
      </main>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Manual edits mean the shopper has diverged from the saved card.
    setSelectedId(null);
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const selectAddress = (a: SavedAddress) => {
    setSelectedId(a.id);
    fillFormFromAddress(a);
  };

  const useNewAddress = () => {
    setSelectedId(null);
    setForm((f) => ({
      ...f,
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "India",
    }));
  };

  const handleDeleteAddress = async (id: string) => {
    const res = await deleteAddress(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast.success("Address removed");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Best-effort: remember this address for next time. Never block the order
    // on it — the order is the important part.
    if (saveForLater) {
      try {
        await saveAddressAction(form);
      } catch {
        // ignore — saving the address book entry is not critical to the order
      }
    }

    const result = await placeOrder(form, cart.items, cart.appliedCoupon?.code);

    if ("error" in result) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    toast.success("Order placed successfully!");
    orderPlaced.current = true;
    router.push(`/checkout/success?orderId=${result.orderId}`);
    cart.clear(); // Clear the cart state after navigating away.
  };

  return (
    <main className="max-w-5xl mx-auto px-4 pt-[120px] pb-12 md:pb-16">
      <h1 className="text-3xl font-bold mb-8">Checkout</h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form */}
        <div className="md:col-span-7 space-y-8">
          {/* Saved addresses */}
          {addresses.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Delivery Address</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectAddress(a)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectAddress(a);
                      }
                    }}
                    className={`relative cursor-pointer rounded-lg border p-3 pr-9 text-left transition-colors ${
                      selectedId === a.id
                        ? "border-primary ring-1 ring-primary"
                        : "hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className="text-sm font-medium">
                      {a.first_name} {a.last_name}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {a.address_line1}
                      {a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city},{" "}
                      {a.state} {a.postal_code}
                    </div>
                    {a.phone && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {a.phone}
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label="Remove address"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAddress(a.id);
                      }}
                      className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={useNewAddress}
                  className={`rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors ${
                    selectedId === null
                      ? "border-primary text-foreground"
                      : "hover:border-muted-foreground/40"
                  }`}
                >
                  + Use a new address
                </button>
              </div>
            </div>
          )}

          <form
            id="checkout-form"
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Contact Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    required
                    value={form.firstName}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    required
                    value={form.lastName}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    value={form.phone}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Shipping Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Shipping Address</h2>
              <div className="space-y-2">
                <Label htmlFor="addressLine1">Address Line 1 *</Label>
                <Input
                  id="addressLine1"
                  name="addressLine1"
                  required
                  value={form.addressLine1}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
                <Input
                  id="addressLine2"
                  name="addressLine2"
                  value={form.addressLine2}
                  onChange={handleChange}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    name="city"
                    required
                    value={form.city}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    name="state"
                    required
                    value={form.state}
                    onChange={handleChange}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code *</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    required
                    value={form.postalCode}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    name="country"
                    required
                    value={form.country}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saveForLater}
                  onChange={(e) => setSaveForLater(e.target.checked)}
                  className="h-4 w-4"
                />
                Save this address for future orders
              </label>
            </div>

            {/* Payment Method */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Payment Method</h2>
              <div className="border rounded-lg p-4 flex items-center gap-3 bg-muted/30">
                <input
                  type="radio"
                  id="cod"
                  name="payment"
                  checked
                  readOnly
                  className="h-4 w-4"
                />
                <Label
                  htmlFor="cod"
                  className="font-medium cursor-pointer flex-1"
                >
                  Cash on Delivery (COD)
                </Label>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Pay with cash when your order is delivered.
              </p>
            </div>
          </form>
        </div>

        {/* Right Column: Order Summary */}
        <div className="md:col-span-5 border rounded-xl p-6 bg-muted/10 sticky top-8">
          <h2 className="text-xl font-semibold mb-6">Order Summary</h2>

          <ul className="space-y-4 mb-6 max-h-[40vh] overflow-y-auto pr-2">
            {cart.items.map((item, idx) => (
              <li key={idx} className="flex gap-4">
                <div className="flex-1">
                  <h4 className="font-medium text-sm">{item.name}</h4>
                  {item.variantName && (
                    <p className="text-xs text-muted-foreground">
                      {item.variantName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Qty: {item.quantity}
                  </p>
                </div>
                <div className="font-medium text-sm text-right">
                  {formatPrice(item.price * item.quantity)}
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t pt-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(cart.subtotal)}</span>
            </div>
            {cart.appliedCoupon &&
              cart.couponValid &&
              cart.couponDiscount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({cart.appliedCoupon.code})</span>
                  <span>-{formatPrice(cart.couponDiscount)}</span>
                </div>
              )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>Free</span>
            </div>
            <div className="border-t pt-3 flex justify-between font-bold text-base">
              <span>Total</span>
              <span>{formatPrice(cart.total)}</span>
            </div>
          </div>

          <Button
            type="submit"
            form="checkout-form"
            className="w-full mt-8"
            size="lg"
            disabled={loading}
          >
            {loading ? "Processing..." : "Place Order (COD)"}
          </Button>
        </div>
      </div>
    </main>
  );
}
