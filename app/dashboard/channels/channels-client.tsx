"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  ShieldCheck,
  Lock,
  Unplug,
  CheckCircle2,
} from "lucide-react";
import {
  disconnectRazorpay,
  saveRazorpayCredentials,
  setRazorpayEnabled,
  type ChannelState,
} from "@/app/actions/payment-provider-actions";

// Channels — where a store connects external sales/payment surfaces.
// v1 ships one channel: Digital payments via the merchant's own Razorpay
// account (BYO gateway — money settles with them, zero platform fee).
export function ChannelsClient({
  initialState,
  canManage,
}: {
  initialState: ChannelState;
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState(initialState);
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [showForm, setShowForm] = useState(!initialState.connected);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await saveRazorpayCredentials(keyId, keySecret);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Razorpay connected — online payments are live.");
    setState((s) => ({
      ...s,
      connected: true,
      keyId: keyId.trim(),
      enabled: true,
    }));
    setKeyId("");
    setKeySecret("");
    setShowForm(false);
    refresh();
  }

  async function handleToggle() {
    const next = !state.enabled;
    setToggling(true);
    const res = await setRazorpayEnabled(next);
    setToggling(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setState((s) => ({ ...s, enabled: next }));
    toast.success(
      next ? "Online payments enabled." : "Online payments paused.",
    );
    refresh();
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect Razorpay? Online payments will stop; your Razorpay account itself is untouched.",
      )
    ) {
      return;
    }
    const res = await disconnectRazorpay();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setState((s) => ({ ...s, connected: false, keyId: null, enabled: false }));
    setShowForm(true);
    toast.success("Razorpay disconnected.");
    refresh();
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111827]">Channels</h1>
        <p className="mt-1 text-sm text-[#5b6472]">
          Connect the services your store sells through. Money from online
          payments settles directly in your own gateway account — StoreMink
          never touches it and takes no transaction fee.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(17,24,39,0.08)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[rgba(17,24,39,0.08)] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <CreditCard className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">
                Digital payments — Razorpay
              </h2>
              <p className="mt-0.5 text-sm text-[#5b6472]">
                UPI, cards and netbanking at checkout, on your own Razorpay
                account.
              </p>
            </div>
          </div>
          {state.connected &&
            (state.enabled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-sm font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                <CheckCircle2 className="h-4 w-4" /> Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Paused
              </span>
            ))}
        </div>

        <div className="p-6">
          {!state.planAllowsOnlinePayments ? (
            <div className="flex items-start gap-3 rounded-md bg-amber-50 p-4">
              <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">
                  Online payments are included from the Basic plan.
                </p>
                <p className="mt-1">
                  Upgrade your plan to connect your own Razorpay account —
                  checkout stays Cash&nbsp;on&nbsp;Delivery until then.
                </p>
              </div>
            </div>
          ) : state.connected && !showForm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-[rgba(17,24,39,0.08)] bg-[#f9fafb] px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-[#344054]">
                    Key ID
                  </div>
                  <div className="mt-0.5 font-mono text-sm text-[#111827]">
                    {state.keyId}
                  </div>
                  <div className="mt-1 text-xs text-[#5b6472]">
                    The key secret is stored encrypted and never shown again.
                  </div>
                </div>
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>

              {canManage && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="dash-btn dash-btn-primary"
                    onClick={handleToggle}
                    disabled={toggling}
                  >
                    {toggling
                      ? "Saving…"
                      : state.enabled
                        ? "Pause online payments"
                        : "Resume online payments"}
                  </button>
                  <button
                    type="button"
                    className="dash-btn"
                    onClick={() => setShowForm(true)}
                  >
                    Replace keys
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    onClick={handleDisconnect}
                  >
                    <Unplug className="h-4 w-4" /> Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <p className="text-sm text-[#5b6472]">
                Paste the API keys from your Razorpay dashboard (Settings → API
                keys). We verify them with Razorpay before saving; the secret is
                encrypted and never displayed again.
              </p>
              <div>
                <label
                  htmlFor="rzp-key-id"
                  className="mb-1.5 block text-sm font-medium text-[#344054]"
                >
                  Key ID
                </label>
                <input
                  id="rzp-key-id"
                  className="dash-input max-w-md font-mono"
                  placeholder="rzp_live_…"
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  required
                  disabled={!canManage || saving}
                />
              </div>
              <div>
                <label
                  htmlFor="rzp-key-secret"
                  className="mb-1.5 block text-sm font-medium text-[#344054]"
                >
                  Key Secret
                </label>
                <input
                  id="rzp-key-secret"
                  type="password"
                  className="dash-input max-w-md font-mono"
                  placeholder="••••••••••••"
                  value={keySecret}
                  onChange={(e) => setKeySecret(e.target.value)}
                  required
                  autoComplete="off"
                  disabled={!canManage || saving}
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  className="dash-btn dash-btn-primary"
                  disabled={!canManage || saving}
                >
                  {saving ? "Verifying…" : "Verify & save"}
                </button>
                {state.connected && (
                  <button
                    type="button"
                    className="dash-btn"
                    onClick={() => setShowForm(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
