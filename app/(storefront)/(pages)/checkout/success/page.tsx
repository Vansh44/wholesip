"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
      <h1 className="text-4xl font-bold mb-4">Order Confirmed!</h1>
      <p className="text-muted-foreground text-lg mb-8">
        Thank you for your purchase. We have received your order and will begin
        processing it shortly.
      </p>

      {orderId && (
        <div className="bg-muted/30 p-4 rounded-lg mb-8 inline-block text-left">
          <p className="text-sm text-muted-foreground mb-1">Order Reference</p>
          <p className="font-mono font-medium text-lg">{orderId}</p>
        </div>
      )}

      <div className="space-y-4">
        <Link href="/shop" passHref legacyBehavior>
          <Button size="lg" className="w-full sm:w-auto px-8">
            Continue Shopping
          </Button>
        </Link>
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
