"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCart } from "@/app/(storefront)/components/cart/CartProvider";
import { placeOrder, CheckoutFormData } from "@/app/actions/checkout-actions";
import { useAuth } from "@/app/(storefront)/components/auth/AuthProvider";
import { formatPrice } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CheckoutPage() {
  const router = useRouter();
  const { customer, loading: authLoading, openAuthModal } = useAuth();
  const cart = useCart();

  const [loading, setLoading] = useState(false);
  // Set once the order is placed so clearing the cart below doesn't trip the
  // "cart empty → /shop" effect and steal the redirect to the success page.
  const orderPlaced = useRef(false);
  const [form, setForm] = useState<CheckoutFormData>({
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
  });

  // Protect route
  useEffect(() => {
    if (!authLoading && !customer) {
      toast.error("You must be logged in to checkout");
      router.push("/");
      openAuthModal();
    }
  }, [authLoading, customer, router, openAuthModal]);

  // Pre-fill form
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

  // Redirect if cart empty (but not when we just emptied it after a successful
  // order — that navigates to the success page instead).
  useEffect(() => {
    if (orderPlaced.current) return;
    if (cart.hydrated && cart.items.length === 0) {
      toast.info("Your cart is empty");
      router.push("/shop");
    }
  }, [cart.hydrated, cart.items.length, router]);

  if (authLoading || !cart.hydrated || !customer || cart.items.length === 0) {
    return (
      <main className="min-h-[50vh] flex items-center justify-center">
        <p className="text-muted-foreground">Loading checkout...</p>
      </main>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

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
