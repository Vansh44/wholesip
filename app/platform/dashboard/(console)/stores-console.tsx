"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setStoreStatus,
  setStorePlan,
  deleteStore,
  type PlatformStoreRow,
} from "@/app/actions/platform";
import {
  PLAN_META,
  normalizePlan,
  upgradeTargets,
  type Plan,
} from "@/lib/plans";
import { Search, AlertTriangle, ArrowUpCircle } from "lucide-react";

// Badge styling per plan — free is neutral, paid tiers get colour.
const PLAN_BADGE: Record<Plan, string> = {
  free: "bg-gray-50 text-gray-600 ring-gray-500/10",
  starter: "bg-sky-50 text-sky-700 ring-sky-600/20",
  pro: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

function storeUrl(store: PlatformStoreRow, rootDomain: string): string {
  return store.custom_domain
    ? `https://${store.custom_domain}`
    : `https://${store.slug}.${rootDomain}`;
}

export function StoresConsole({
  stores,
  canManage,
  q,
  rootDomain,
}: {
  stores: PlatformStoreRow[];
  canManage: boolean;
  email: string;
  q: string;
  rootDomain: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Permanent-delete confirmation: the operator must retype the store slug.
  const [toDelete, setToDelete] = useState<PlatformStoreRow | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Plan-upgrade dialog (upgrade-only; pro stores never show the button).
  const [toUpgrade, setToUpgrade] = useState<PlatformStoreRow | null>(null);
  const [targetPlan, setTargetPlan] = useState<Plan | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");

  function openUpgrade(store: PlatformStoreRow) {
    const targets = upgradeTargets(normalizePlan(store.plan));
    setToUpgrade(store);
    setTargetPlan(targets.length === 1 ? targets[0] : null);
    setUpgradeError("");
  }

  async function confirmUpgrade() {
    if (!toUpgrade || !targetPlan) return;
    setUpgrading(true);
    setUpgradeError("");
    const res = await setStorePlan(toUpgrade.id, targetPlan);
    setUpgrading(false);
    if (res.error) {
      setUpgradeError(res.error);
      return;
    }
    setToUpgrade(null);
    startTransition(() => router.refresh());
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = search.trim()
      ? `?q=${encodeURIComponent(search.trim())}`
      : "";
    router.push(`/dashboard${params}`);
  }

  async function toggleStatus(store: PlatformStoreRow) {
    setPendingId(store.id);
    const next = store.status === "active" ? "suspended" : "active";
    const res = await setStoreStatus(store.id, next);
    setPendingId(null);
    if (res.error) {
      alert(res.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  function openDelete(store: PlatformStoreRow) {
    setToDelete(store);
    setConfirmText("");
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError("");
    const res = await deleteStore(toDelete.id);
    setDeleting(false);
    if (res.error) {
      setDeleteError(res.error);
      return;
    }
    setToDelete(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Stores
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Every store on the platform. Open a store to manage it, or suspend
            one to take it offline.
          </p>
        </div>

        <form className="relative w-full sm:max-w-sm" onSubmit={submitSearch}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 pl-9 text-sm outline-none placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-100 transition-all shadow-sm"
            placeholder="Search stores by name or address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <div className="border border-gray-200 bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Store</th>
                <th className="px-6 py-3 font-medium text-gray-500">Owner</th>
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Plan</th>
                <th className="px-6 py-3 font-medium text-gray-500">Created</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stores.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    No stores found.
                  </td>
                </tr>
              )}
              {stores.map((s) => {
                const addr = s.custom_domain ?? `${s.slug}.${rootDomain}`;
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">
                        {s.name}
                      </div>
                      <div className="text-gray-500 mt-0.5">{addr}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {s.owner_email ?? (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                          s.status === "active"
                            ? "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20"
                            : "bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/10"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ring-1 ring-inset ${PLAN_BADGE[normalizePlan(s.plan)]}`}
                      >
                        {PLAN_META[normalizePlan(s.plan)].name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(s.created_at).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <a
                          className="text-primary hover:text-primary/80 font-medium transition-colors"
                          href={`${storeUrl(s, rootDomain)}/dashboard`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open ↗
                        </a>
                        {canManage &&
                          upgradeTargets(normalizePlan(s.plan)).length > 0 && (
                            <button
                              className="px-3 py-1.5 rounded-md text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors inline-flex items-center gap-1"
                              onClick={() => openUpgrade(s)}
                            >
                              <ArrowUpCircle className="h-3.5 w-3.5" />
                              Upgrade
                            </button>
                          )}
                        {canManage && (
                          <button
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                              s.status === "active"
                                ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                : "text-gray-700 bg-gray-100 hover:bg-gray-200"
                            }`}
                            disabled={pendingId === s.id}
                            onClick={() => toggleStatus(s)}
                          >
                            {pendingId === s.id
                              ? "…"
                              : s.status === "active"
                                ? "Suspend"
                                : "Activate"}
                          </button>
                        )}
                        {canManage && (
                          <button
                            className="px-3 py-1.5 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                            onClick={() => openDelete(s)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !upgrading && setToUpgrade(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <ArrowUpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Upgrade {toUpgrade.name}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Currently on{" "}
                    <span className="font-medium capitalize">
                      {PLAN_META[normalizePlan(toUpgrade.plan)].name}
                    </span>
                    . Upgrades apply immediately; plans can&apos;t be downgraded
                    from the console.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {upgradeTargets(normalizePlan(toUpgrade.plan)).map((p) => {
                  const meta = PLAN_META[p];
                  const active = targetPlan === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTargetPlan(p)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? "border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/40"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          {meta.name}
                        </span>
                        <span className="text-sm text-gray-600">
                          ₹{meta.monthlyInr.toLocaleString("en-IN")}/mo
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {meta.tagline}
                      </p>
                    </button>
                  );
                })}
                {upgradeError && (
                  <p className="text-sm text-red-600">{upgradeError}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setToUpgrade(null)}
                disabled={upgrading}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={upgrading || !targetPlan}
                onClick={confirmUpgrade}
              >
                {upgrading
                  ? "Upgrading…"
                  : targetPlan
                    ? `Upgrade to ${PLAN_META[targetPlan].name}`
                    : "Choose a plan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleting && setToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Permanently delete {toDelete.name}?
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    This erases the store and <strong>all of its data</strong> —
                    products, categories, blogs, pages, menus, coupons and
                    uploaded media — plus every login for it (owner
                    {toDelete.owner_email ? ` ${toDelete.owner_email}` : ""},
                    staff and customers). This <strong>cannot be undone</strong>
                    .
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label className="text-sm font-medium text-gray-700">
                  Type{" "}
                  <span className="font-mono font-semibold text-gray-900">
                    {toDelete.slug}
                  </span>{" "}
                  to confirm
                </label>
                <input
                  autoFocus
                  className="mt-2 h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-red-400 focus:ring-4 focus:ring-red-50"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={toDelete.slug}
                  disabled={deleting}
                />
                {deleteError && (
                  <p className="mt-2 text-sm text-red-600">{deleteError}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100"
                onClick={() => setToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={deleting || confirmText.trim() !== toDelete.slug}
                onClick={confirmDelete}
              >
                {deleting ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
