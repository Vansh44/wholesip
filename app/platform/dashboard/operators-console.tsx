"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  invitePlatformAdmin,
  updatePlatformAdminRole,
  removePlatformAdmin,
  type PlatformAdminRow,
} from "@/app/actions/platform";

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
    <div className="w-full max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operators</h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform operators can manage every store. Superadmins can also add and remove operators.
          </p>
        </div>

        {canManage && (
          <form className="flex w-full sm:w-auto items-center gap-3" onSubmit={invite}>
            <input
              className="flex h-10 w-[240px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-gray-400 focus:border-gray-300 focus:ring-4 focus:ring-gray-100 transition-all shadow-sm"
              type="email"
              placeholder="operator@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMsg(null);
              }}
              required
            />
            <select
              className="flex h-10 w-[140px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-300 focus:ring-4 focus:ring-gray-100 transition-all shadow-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "superadmin")}
            >
              <option value="member">Member</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <button
              className="flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 transition-colors disabled:opacity-50"
              type="submit"
              disabled={busy}
            >
              {busy ? "Adding…" : "Add operator"}
            </button>
            {msg && (
              <span className={`text-sm font-medium ml-2 ${msg.ok ? "text-green-600" : "text-red-600"}`}>
                {msg.text}
              </span>
            )}
          </form>
        )}
      </div>

      <div className="border border-gray-200 bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 font-medium text-gray-500">Role</th>
                <th className="px-6 py-3 font-medium text-gray-500">Added</th>
                {canManage && <th className="px-6 py-3 font-medium text-gray-500 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-semibold text-gray-900">{a.email}</span>
                  {a.email.toLowerCase() === myEmail.toLowerCase() && (
                    <span className="text-gray-500 ml-2">(you)</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium capitalize ${
                      a.role === "superadmin"
                        ? "bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20"
                        : "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20"
                    }`}
                  >
                    {a.role}
                  </span>
                </td>
                  <td className="px-6 py-4 text-gray-600">
                  {new Date(a.created_at).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                {canManage && (
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        className="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                        onClick={() => changeRole(a)}
                      >
                        {a.role === "superadmin" ? "Make member" : "Make superadmin"}
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
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
    </div>
  );
}
