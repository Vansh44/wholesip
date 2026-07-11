"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Coins,
  ShoppingCart,
  Gift,
  Zap,
  Lock,
  History,
} from "lucide-react";
import {
  confirmCreditPurchase,
  startCreditPurchase,
  type AiUsagePageData,
} from "@/app/actions/ai-credit-actions";
import type { CreditPack } from "@/lib/ai/credits";
import { openRazorpayModal } from "@/lib/payments/razorpay-client";
import { PLAN_META, normalizePlan } from "@/lib/plans";

const KIND_META: Record<
  AiUsagePageData["ledger"][number]["kind"],
  { label: string; Icon: typeof Zap; tone: string }
> = {
  spend: { label: "Generation", Icon: Zap, tone: "text-gray-500" },
  purchase: { label: "Purchase", Icon: ShoppingCart, tone: "text-green-600" },
  grant: { label: "Grant", Icon: Gift, tone: "text-indigo-600" },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiUsageClient({
  initialData,
  packs,
  canManage,
}: {
  initialData: AiUsagePageData;
  packs: CreditPack[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const data = initialData;
  const [buyingPack, setBuyingPack] = useState<string | null>(null);

  const { used, cap, creditBalance } = data.usage;
  const planName = PLAN_META[normalizePlan(data.plan)].name;
  const pct =
    cap === null
      ? 0
      : Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));

  async function handleBuy(pack: CreditPack) {
    setBuyingPack(pack.id);
    const start = await startCreditPurchase(pack.id);
    if ("error" in start) {
      toast.error(start.error);
      setBuyingPack(null);
      return;
    }
    const opened = await openRazorpayModal({
      keyId: start.keyId,
      rzpOrderId: start.rzpOrderId,
      amountPaise: start.amountPaise,
      name: "StoreMink",
      description: `${pack.credits} AI credits — ${start.packName} pack`,
      onSuccess: async (res) => {
        const confirm = await confirmCreditPurchase(
          start.purchaseId,
          res.razorpay_payment_id,
          res.razorpay_signature,
        );
        setBuyingPack(null);
        if (confirm.error) {
          toast.info(
            "Payment received — your credits will appear here in a few minutes.",
          );
        } else {
          toast.success(`${confirm.creditsAdded} AI credits added!`);
        }
        startRefresh(() => router.refresh());
      },
      onDismiss: () => {
        setBuyingPack(null);
        toast.error("Payment not completed.");
      },
    });
    if (!opened) {
      setBuyingPack(null);
      toast.error("Couldn't load the payment window. Please try again.");
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111827]">AI usage</h1>
        <p className="mt-1 text-sm text-[#5b6472]">
          Every AI generation (product copy, SEO, brand voice, coupon emails)
          uses your plan&apos;s monthly allowance first, then your purchased
          credits — credits never expire.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Monthly allowance */}
        <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                This month
              </h2>
              <p className="text-sm text-[#5b6472]">
                {planName} plan allowance
              </p>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-[#111827]">{used}</span>
              <span className="text-sm text-[#5b6472]">
                of {cap === null ? "unlimited" : cap} generations
              </span>
            </div>
            {cap !== null && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            <p className="mt-2 text-xs text-[#5b6472]">
              Resets on the 1st of every month.
            </p>
          </div>
        </div>

        {/* Credit balance */}
        <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Coins className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                AI credits
              </h2>
              <p className="text-sm text-[#5b6472]">Never expire</p>
            </div>
          </div>
          <div className="mt-5">
            <span className="text-3xl font-bold text-[#111827]">
              {creditBalance}
            </span>
            <span className="ml-2 text-sm text-[#5b6472]">
              credit{creditBalance === 1 ? "" : "s"} remaining
            </span>
            <p className="mt-2 text-xs text-[#5b6472]">
              Used automatically once the monthly allowance runs out.
            </p>
          </div>
        </div>
      </div>

      {/* Buy credits */}
      <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white shadow-sm">
        <div className="border-b border-[rgba(17,24,39,0.08)] p-6">
          <h2 className="text-lg font-semibold text-[#111827]">Buy credits</h2>
          <p className="mt-1 text-sm text-[#5b6472]">
            Top up when you need more generations — cheaper per generation than
            upgrading a plan for a one-off burst.
          </p>
        </div>
        <div className="p-6">
          {!data.canBuyCredits ? (
            <div className="flex items-start gap-3 rounded-md bg-amber-50 p-4">
              <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  Credit top-ups are available from the Basic plan.
                </p>
                <p className="mt-1">
                  Upgrade your plan to buy AI credits and unlock a larger
                  monthly allowance.
                </p>
              </div>
            </div>
          ) : !data.purchasesAvailable ? (
            <p className="text-sm text-[#5b6472]">
              Credit purchases aren&apos;t available right now. Please check
              back soon.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className={`relative rounded-lg border p-5 ${
                    pack.popular
                      ? "border-indigo-300 ring-1 ring-indigo-200"
                      : "border-[rgba(17,24,39,0.08)]"
                  }`}
                >
                  {pack.popular && (
                    <span className="absolute -top-2.5 left-4 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                      Most popular
                    </span>
                  )}
                  <div className="text-sm font-medium text-[#5b6472]">
                    {pack.name}
                  </div>
                  <div className="mt-1 text-2xl font-bold text-[#111827]">
                    {pack.credits}{" "}
                    <span className="text-sm font-medium text-[#5b6472]">
                      credits
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-[#5b6472]">
                    ₹{pack.priceInr.toLocaleString("en-IN")} · ₹
                    {(pack.priceInr / pack.credits).toFixed(2)}/credit
                  </div>
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary mt-4 w-full justify-center"
                    onClick={() => handleBuy(pack)}
                    disabled={!canManage || buyingPack !== null}
                  >
                    {buyingPack === pack.id ? "Opening…" : "Buy now"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[rgba(17,24,39,0.08)] p-6">
          <History className="h-4 w-4 text-[#5b6472]" />
          <h2 className="text-lg font-semibold text-[#111827]">
            Recent credit activity
          </h2>
        </div>
        {data.ledger.length === 0 ? (
          <p className="p-6 text-sm text-[#5b6472]">
            No credit activity yet — purchases, grants and spends will show up
            here.
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(17,24,39,0.06)]">
            {data.ledger.map((entry) => {
              const meta = KIND_META[entry.kind];
              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between px-6 py-3"
                >
                  <div className="flex items-center gap-3">
                    <meta.Icon className={`h-4 w-4 ${meta.tone}`} />
                    <div>
                      <div className="text-sm font-medium text-[#344054]">
                        {meta.label}
                        {entry.note ? (
                          <span className="ml-2 text-xs font-normal text-[#5b6472]">
                            {entry.note}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-[#5b6472]">
                        {formatDateTime(entry.created_at)}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      entry.delta > 0 ? "text-green-600" : "text-[#5b6472]"
                    }`}
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
