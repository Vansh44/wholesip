"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  // The human-readable reference (ORD…) when present; fall back to the raw id.
  const orderRef = searchParams.get("ref") || orderId;

  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
      <h1 className="text-4xl font-bold mb-4">Order Confirmed!</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Thank you for your purchase. We have received your order and will begin
        processing it shortly.
      </p>

      {orderRef && (
        <div className="bg-muted/30 p-4 rounded-lg mb-8 inline-block text-left">
          <p className="text-sm text-muted-foreground mb-1">Order Reference</p>
          <p className="font-mono font-medium text-lg">{orderRef}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Themed on the storefront accent (matches the checkout "Place Order"
            button). Color is set via inline style so it beats the storefront's
            `.storefront-root a { color: inherit }` rule (which would otherwise
            drag the text to dark ink on this accent-filled button). */}
        <Link
          href="/shop"
          className="inline-flex w-full items-center justify-center rounded-[var(--wholesip-radius-control)] bg-[var(--wholesip-accent)] px-8 py-3.5 text-base font-semibold transition-colors hover:bg-[var(--wholesip-accent-deep)] sm:w-auto"
          style={{ color: "var(--wholesip-on-accent)" }}
        >
          Continue Shopping
        </Link>
        {orderId && (
          <div>
            <Link
              href={`/checkout/invoice/${orderId}`}
              className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              View / download invoice
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <main>
      <Suspense fallback={<div className="py-24 text-center">Loading...</div>}>
        <SuccessContent />
      </Suspense>
    </main>
  );
}
