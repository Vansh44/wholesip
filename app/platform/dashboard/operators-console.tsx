"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  invitePlatformAdmin,
  updatePlatformAdminRole,
  removePlatformAdmin,
  type PlatformAdminRow,
} from "@/app/actions/platform";
import { ConsoleTabs } from "./console-tabs";
import "./console.css";

export function OperatorsConsole({
  admins,
  canManage,
  myEmail,
}: {
  admins: PlatformAdminRow[];
  canManage: boolean;
  myEmail: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "superadmin">("member");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await invitePlatformAdmin(email, role);
    setBusy(false);
    if (res.error) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: `${email} added as ${role}.` });
    setEmail("");
    refresh();
  }

  async function changeRole(a: PlatformAdminRow) {
    const next = a.role === "superadmin" ? "member" : "superadmin";
    const res = await updatePlatformAdminRole(a.id, next);
    if (res.error) return alert(res.error);
    refresh();
  }

  async function remove(a: PlatformAdminRow) {
    if (!confirm(`Remove ${a.email} as an operator?`)) return;
    const res = await removePlatformAdmin(a.id);
    if (res.error) return alert(res.error);
    refresh();
  }

  return (
    <div className="con-wrap">
      <div className="con-head">
        <h1>Storemink Admin</h1>
        <span className="con-who">{myEmail}</span>
      </div>
      <ConsoleTabs />

      <p className="con-lead">
        Platform operators can manage every store. Superadmins can also add and
        remove operators.
      </p>

      {canManage && (
        <form className="con-toolbar" onSubmit={invite}>
          <input
            className="con-search"
            type="email"
            placeholder="operator@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setMsg(null);
            }}
          />
          <select
            className="con-select"
            value={role}
            onChange={(e) => setRole(e.target.value as "member" | "superadmin")}
          >
            <option value="member">Member</option>
            <option value="superadmin">Superadmin</option>
          </select>
          <button className="con-btn" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add operator"}
          </button>
          {msg && (
            <span
              className={`stq-hint ${msg.ok ? "ok" : "bad"}`}
              style={{ margin: 0 }}
            >
              {msg.text}
            </span>
          )}
        </form>
      )}

      <div className="con-table-scroll">
        <table className="con-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Added</th>
              {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="con-store-name">
                  {a.email}
                  {a.email.toLowerCase() === myEmail.toLowerCase() && (
                    <span className="con-store-addr"> (you)</span>
                  )}
                </td>
                <td>
                  <span
                    className={`con-badge ${a.role === "superadmin" ? "active" : "pending"}`}
                  >
                    {a.role}
                  </span>
                </td>
                <td>{new Date(a.created_at).toLocaleDateString()}</td>
                {canManage && (
                  <td>
                    <div className="con-actions">
                      <button className="con-btn" onClick={() => changeRole(a)}>
                        {a.role === "superadmin"
                          ? "Make member"
                          : "Make superadmin"}
                      </button>
                      <button
                        className="con-btn danger"
                        onClick={() => remove(a)}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
