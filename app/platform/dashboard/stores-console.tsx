"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStoreStatus, type PlatformStoreRow } from "@/app/actions/platform";
import { ConsoleTabs } from "./console-tabs";
import "./console.css";

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
    <div className="con-wrap">
      <div className="con-head">
        <h1>Storemink Admin</h1>
        <span className="con-who">{email}</span>
      </div>
      <ConsoleTabs />
      <p className="con-lead">
        Every store on the platform. Open a store to manage it, or suspend one
        to take it offline.
      </p>

      <form className="con-toolbar" onSubmit={submitSearch}>
        <input
          className="con-search"
          placeholder="Search stores by name or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="con-count">
          {stores.length} store{stores.length === 1 ? "" : "s"}
        </span>
      </form>

      <div className="con-table-scroll">
        <table className="con-table">
          <thead>
            <tr>
              <th>Store</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Created</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {stores.length === 0 && (
              <tr>
                <td colSpan={5} className="con-empty">
                  No stores found.
                </td>
              </tr>
            )}
            {stores.map((s) => {
              const addr = s.custom_domain ?? `${s.slug}.${rootDomain}`;
              return (
                <tr key={s.id}>
                  <td>
                    <div className="con-store-name">{s.name}</div>
                    <div className="con-store-addr">{addr}</div>
                  </td>
                  <td>
                    <span className={`con-badge ${s.status}`}>{s.status}</span>
                  </td>
                  <td>{s.plan}</td>
                  <td>{new Date(s.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="con-actions">
                      <a
                        className="con-link"
                        href={`${storeUrl(s, rootDomain)}/dashboard`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open ↗
                      </a>
                      {canManage && (
                        <button
                          className={`con-btn ${s.status === "active" ? "danger" : ""}`}
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
  );
}
