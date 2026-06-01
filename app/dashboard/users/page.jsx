"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/app/lib/supabaseClient";
import styles from "../Admin.module.css";

export default function UsersPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Form State
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState("");
  const [formError, setFormError] = useState("");

  // Authenticate and verify role (Superadmin only)
  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/dashboard/login");
        return;
      }

      // Fetch user profile role
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (error || !profile || profile.role !== "superadmin") {
        console.warn("Access denied. Superadmin permission required.");
        router.push("/dashboard");
      } else {
        setCurrentUser(session.user);
        setAuthLoading(false);
        fetchUsers();
      }
    };

    checkAccess();
  }, [router]);

  // Fetch profiles listing
  const fetchUsers = async () => {
    setLoadingUsers(true);
    setDbError(null);
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsersList(profiles || []);
    } catch (err) {
      console.error(err);
      setDbError("Unable to retrieve user directory. Verify SQL setup and keys.");
    } finally {
      setLoadingUsers(false);
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/dashboard/login");
  };

  // Add User
  const handleInvite = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError("");
    setFormSuccess("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired. Please sign in again.");

      const response = await fetch("/api/dashboard/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ email, role })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to invite user.");
      }

      setFormSuccess(`User "${email}" invited successfully. Temporary password printed to server terminal logs.`);
      setEmail("");
      setRole("member");
      fetchUsers();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Something went wrong.");
    } finally {
      setFormLoading(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (userId, userEmail) => {
    if (userId === currentUser.id) {
      alert("Self-deletion is forbidden.");
      return;
    }

    if (!confirm(`Are you sure you want to remove dashboard access for "${userEmail}"?`)) {
      return;
    }

    setFormError("");
    setFormSuccess("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired.");

      const response = await fetch(`/api/dashboard/users?id=${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete user.");
      }

      setFormSuccess(`User "${userEmail}" access has been revoked.`);
      fetchUsers();
    } catch (err) {
      console.error(err);
      setFormError(err.message || "Failed to delete user.");
    }
  };

  if (authLoading) {
    return (
      <main className={styles.adminContainer}>
        <div className={styles.loadingSpinner}>Checking user access privileges...</div>
      </main>
    );
  }

  return (
    <main className={styles.adminContainer}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>User Management</h1>
          <p style={{ color: "#707070" }}>Only Superadmins can view and invite dashboard administrators.</p>
        </div>
        <div className={styles.headerNav}>
          <Link href="/dashboard" className={styles.navLink}>
            Return to Catalog
          </Link>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </header>

      {dbError && (
        <div className={`${styles.alert} ${styles.errorAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <strong>Database Notice:</strong> {dbError}
        </div>
      )}

      {formSuccess && (
        <div className={`${styles.alert} ${styles.successAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {formSuccess}
        </div>
      )}

      {formError && (
        <div className={`${styles.alert} ${styles.errorAlert}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {formError}
        </div>
      )}

      <div className={styles.workspaceGrid}>
        {/* User directory list */}
        <section className={styles.panelCard}>
          <h2 className={styles.panelTitle}>Active Team Administrators</h2>
          {loadingUsers ? (
            <div className={styles.loadingSpinner}>Updating directory...</div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Email Address</th>
                    <th className={styles.th}>Role</th>
                    <th className={styles.th}>First Login Setup</th>
                    <th className={styles.th}>Member Since</th>
                    <th className={styles.th} style={{ textAlign: "right" }}>Revoke</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((usr) => (
                    <tr key={usr.id}>
                      <td className={styles.td} style={{ fontWeight: 700 }}>
                        {usr.email} {usr.id === currentUser.id && <span style={{ color: "#707070", fontWeight: 400 }}>(You)</span>}
                      </td>
                      <td className={styles.td}>
                        <span className={`${styles.roleBadge} ${usr.role === "superadmin" ? styles.superadminBadge : styles.memberBadge}`}>
                          {usr.role}
                        </span>
                      </td>
                      <td className={styles.td}>
                        <span style={{
                          fontWeight: 700,
                          color: usr.must_change_password ? "#e65100" : "#2e7d32"
                        }}>
                          {usr.must_change_password ? "Pending Reset" : "Completed"}
                        </span>
                      </td>
                      <td className={styles.td} style={{ color: "#707070" }}>
                        {new Date(usr.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric"
                        })}
                      </td>
                      <td className={styles.td} style={{ textAlign: "right" }}>
                        <button
                          onClick={() => handleDeleteUser(usr.id, usr.email)}
                          disabled={usr.id === currentUser.id}
                          className={styles.deleteBtn}
                          title="Revoke User Access"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Add administrator form */}
        <section className={styles.panelCard}>
          <h2 className={styles.panelTitle}>Add Administrator</h2>
          <form onSubmit={handleInvite} className={styles.form}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Email Address</label>
              <input
                type="email"
                required
                className={styles.input}
                placeholder="new-admin@soakd.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={formLoading}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Access Level / Role</label>
              <select
                className={styles.select}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={formLoading}
              >
                <option value="member">Member (Add/Edit catalog & blogs; cannot delete items or manage users)</option>
                <option value="superadmin">Superadmin (Full workspace controls & user directory management)</option>
              </select>
            </div>

            <button type="submit" disabled={formLoading} className={styles.submitBtn}>
              {formLoading ? "Sending Invite..." : "Invite Team Administrator"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
