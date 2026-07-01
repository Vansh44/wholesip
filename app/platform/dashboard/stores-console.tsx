"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStoreStatus, type PlatformStoreRow } from "@/app/actions/platform";
import { Search } from "lucide-react";

function storeUrl(store: PlatformStoreRow, rootDomain: string): string {
  return store.custom_domain
    ? `https://${store.custom_domain}`
    : `https://${store.slug}.${rootDomain}`;
}

export function StoresConsole({
  stores,
  canManage,
  email,
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

  return (
    <div className="w-full max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Stores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every store on the platform. Open a store to manage it, or suspend one to take it offline.
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
                <th className="px-6 py-3 font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 font-medium text-gray-500">Plan</th>
                <th className="px-6 py-3 font-medium text-gray-500">Created</th>
                <th className="px-6 py-3 font-medium text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stores.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No stores found.
                </td>
              </tr>
            )}
              {stores.map((s) => {
                const addr = s.custom_domain ?? `${s.slug}.${rootDomain}`;
                return (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{s.name}</div>
                      <div className="text-gray-500 mt-0.5">{addr}</div>
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
                    <td className="px-6 py-4 text-gray-600 capitalize">{s.plan}</td>
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
                        {canManage && (
                          <button
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                              s.status === "active"
                                ? "text-red-700 bg-red-50 hover:bg-red-100"
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
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
