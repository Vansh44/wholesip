"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CreditCard,
  ShieldCheck,
  Lock,
  Unplug,
  X,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  disconnectRazorpay,
  saveRazorpayCredentials,
  setRazorpayEnabled,
  type ChannelState,
} from "@/app/actions/payment-provider-actions";

// ---------------------------------------------------------------------------
// Channel catalog — data-driven so new channels (logistics, SMS, marketplace…)
// are a one-line addition here later. For now the only live channel is the
// store's own Razorpay payment gateway; everything else the reference shows is
// intentionally not built yet.
// ---------------------------------------------------------------------------

type Category =
  | "payment"
  | "inventory"
  | "logistics"
  | "sms"
  | "email"
  | "ecommerce"
  | "marketplace";

interface ChannelDef {
  id: string;
  name: string;
  category: Category;
  tagline: string;
  /** Brand accent for the icon tile (fallback when no logo). */
  accent: string;
  icon: LucideIcon;
  /** Optional brand logo (public/ path). Drop the official SVG/PNG in
   *  public/channels/ to replace the fallback icon tile. */
  logo?: string;
  /** Natural aspect ratio of the logo (width / height) so wordmark logos
   *  render wide instead of squished into a square. Defaults to 1. */
  logoAspect?: number;
}

const CHANNELS: ChannelDef[] = [
  {
    id: "razorpay",
    name: "Razorpay",
    category: "payment",
    tagline: "Accept UPI, cards & netbanking at checkout",
    accent: "#0b6cff",
    icon: CreditCard,
    logo: "/channels/razorpay.svg",
    logoAspect: 132 / 38, // Razorpay wordmark
  },
];

// Brand logo when the channel ships one, else a tinted icon tile. `height`
// drives the size; the logo keeps its natural aspect (wordmarks render wide).
function ChannelLogo({ def, height }: { def: ChannelDef; height: number }) {
  if (def.logo) {
    const width = Math.round(height * (def.logoAspect ?? 1));
    return (
      <Image
        src={def.logo}
        alt={`${def.name} logo`}
        width={width}
        height={height}
        className="object-contain"
        style={{ maxWidth: "80%", height: "auto" }}
      />
    );
  }
  const Icon = def.icon;
  return (
    <span
      className="flex items-center justify-center rounded-2xl"
      style={{ width: height, height, background: `${def.accent}1a` }}
    >
      <Icon
        style={{ width: height * 0.5, height: height * 0.5, color: def.accent }}
      />
    </span>
  );
}

const CATEGORY_LABEL: Record<Category, string> = {
  payment: "Payment",
  inventory: "Inventory",
  logistics: "Logistics",
  sms: "SMS",
  email: "Email",
  ecommerce: "Ecommerce",
  marketplace: "Marketplace",
};

const CATEGORY_BADGE: Record<Category, string> = {
  payment: "bg-emerald-50 text-emerald-700",
  inventory: "bg-sky-50 text-sky-700",
  logistics: "bg-amber-50 text-amber-700",
  sms: "bg-pink-50 text-pink-700",
  email: "bg-violet-50 text-violet-700",
  ecommerce: "bg-blue-50 text-blue-700",
  marketplace: "bg-orange-50 text-orange-700",
};

// Small iOS-style toggle used on active channel cards.
function Toggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        on ? "bg-emerald-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

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
  const [tab, setTab] = useState<"all" | Category>("all");
  const [query, setQuery] = useState("");
  // Which channel's connect/manage modal is open.
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  // Razorpay is the only channel with real connection state today.
  const isConnected = (id: string) => id === "razorpay" && state.connected;
  const isEnabled = (id: string) => id === "razorpay" && state.enabled;

  const categories = useMemo(() => {
    const present = new Set(CHANNELS.map((c) => c.category));
    return (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) =>
      present.has(c),
    );
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CHANNELS.filter(
      (c) =>
        (tab === "all" || c.category === tab) &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [tab, query]);

  const active = visible.filter((c) => isConnected(c.id));
  const available = visible.filter((c) => !isConnected(c.id));

  async function handleToggle() {
    const next = !state.enabled;
    const res = await setRazorpayEnabled(next);
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

  const countFor = (c: "all" | Category) =>
    c === "all"
      ? CHANNELS.length
      : CHANNELS.filter((ch) => ch.category === c).length;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827]">Channels</h1>
        <p className="mt-1 text-sm text-[#5b6472]">
          Connect the services your store sells and operates through. Money from
          online payments settles directly in your own gateway account —
          StoreMink never touches it and takes no transaction fee.
        </p>
      </div>

      {/* Category tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[rgba(17,24,39,0.08)]">
        {(["all", ...categories] as const).map((c) => {
          const activeTab = tab === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setTab(c)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-[#5b6472] hover:text-[#111827]"
              }`}
            >
              {c === "all" ? "All" : CATEGORY_LABEL[c]}
              <span className="rounded-full bg-[#f1f3f5] px-1.5 py-0.5 text-[11px] font-semibold text-[#5b6472]">
                {countFor(c)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="mb-6 flex max-w-md items-center gap-2 rounded-lg border border-[rgba(17,24,39,0.12)] bg-white px-3 py-2">
        <Search className="h-4 w-4 text-[#9ca3af]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="flex-1 border-none bg-transparent text-sm outline-none placeholder:text-[#9ca3af]"
        />
      </div>

      {active.length > 0 && (
        <Section title="Active channels">
          {active.map((c) => (
            <ChannelCard
              key={c.id}
              def={c}
              badge={
                isEnabled(c.id)
                  ? { text: "Live", tone: "green" }
                  : { text: "Paused", tone: "amber" }
              }
              toggle={
                canManage ? (
                  <Toggle on={isEnabled(c.id)} onClick={handleToggle} />
                ) : null
              }
              onClick={() => setOpenId(c.id)}
            />
          ))}
        </Section>
      )}

      <Section title="Available channels">
        {available.length === 0 ? (
          <p className="text-sm text-[#9ca3af]">
            Every available channel is already connected.
          </p>
        ) : (
          available.map((c) => (
            <ChannelCard
              key={c.id}
              def={c}
              badge={
                c.id === "razorpay" && !state.planAllowsOnlinePayments
                  ? { text: "Basic plan", tone: "amber", icon: Lock }
                  : undefined
              }
              cta="Connect"
              onClick={() => setOpenId(c.id)}
            />
          ))
        )}
      </Section>

      {openId === "razorpay" && (
        <RazorpayModal
          state={state}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onState={setState}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#6b7280]">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </div>
  );
}

function ChannelCard({
  def,
  badge,
  toggle,
  cta,
  onClick,
}: {
  def: ChannelDef;
  badge?: { text: string; tone: "green" | "amber"; icon?: LucideIcon };
  toggle?: React.ReactNode;
  cta?: string;
  onClick: () => void;
}) {
  const BadgeIcon = badge?.icon;
  return (
    // A clickable div (not <button>): the card contains a Toggle button, and a
    // <button> can't nest inside a <button> (invalid HTML / hydration error).
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex cursor-pointer flex-col rounded-xl border border-[rgba(17,24,39,0.1)] bg-white p-4 text-left shadow-sm transition-all hover:border-indigo-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <div className="mb-4 flex items-start justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${CATEGORY_BADGE[def.category]}`}
        >
          {CATEGORY_LABEL[def.category]}
        </span>
        {badge && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              badge.tone === "green"
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
            {badge.text}
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center py-4">
        <ChannelLogo def={def} height={40} />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-[#111827]">{def.name}</div>
          <div className="text-xs text-[#9ca3af]">{def.tagline}</div>
        </div>
        {toggle ??
          (cta ? (
            <span className="shrink-0 text-sm font-semibold text-indigo-600 group-hover:underline">
              {cta}
            </span>
          ) : null)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Razorpay connect / manage modal (the previous page body, now in a dialog).
// ---------------------------------------------------------------------------
function RazorpayModal({
  state,
  canManage,
  onClose,
  onState,
  onRefresh,
}: {
  state: ChannelState;
  canManage: boolean;
  onClose: () => void;
  onState: React.Dispatch<React.SetStateAction<ChannelState>>;
  onRefresh: () => void;
}) {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [showForm, setShowForm] = useState(!state.connected);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

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
    onState((s) => ({
      ...s,
      connected: true,
      keyId: keyId.trim(),
      enabled: true,
    }));
    setKeyId("");
    setKeySecret("");
    setShowForm(false);
    onRefresh();
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
    onState((s) => ({ ...s, enabled: next }));
    toast.success(
      next ? "Online payments enabled." : "Online payments paused.",
    );
    onRefresh();
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
    onState((s) => ({ ...s, connected: false, keyId: null, enabled: false }));
    toast.success("Razorpay disconnected.");
    onRefresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[rgba(17,24,39,0.08)] p-5">
          <div className="flex items-center gap-3">
            <Image
              src="/channels/razorpay.svg"
              alt="Razorpay logo"
              width={Math.round(28 * (132 / 38))}
              height={28}
              className="object-contain"
            />
            <div>
              <h2 className="text-base font-semibold text-[#111827]">
                Razorpay
              </h2>
              <p className="text-xs text-[#5b6472]">
                UPI, cards & netbanking on your own account
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#6b7280] hover:bg-[#f3f4f6]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
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
                  className="dash-input w-full font-mono"
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
                  className="dash-input w-full font-mono"
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
