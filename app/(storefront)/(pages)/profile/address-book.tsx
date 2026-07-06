"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getMyAddresses,
  upsertAddress,
  deleteAddress,
  setDefaultAddress,
  type SavedAddress,
  type AddressInput,
} from "@/app/actions/address-actions";
import styles from "./profile.module.css";

const EMPTY: AddressInput = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
};

export default function AddressBook() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  // null = not editing, "new" = adding, or the id of the address being edited.
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = async () => {
    const list = await getMyAddresses();
    setAddresses(list);
    setLoadingList(false);
  };

  // Initial fetch. setState lives inside the promise callback (async), which the
  // set-state-in-effect rule allows — mirrors the checkout address load.
  useEffect(() => {
    let active = true;
    getMyAddresses().then((list) => {
      if (!active) return;
      setAddresses(list);
      setLoadingList(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const startAdd = () => {
    setForm(EMPTY);
    setEditingId("new");
    setStatus(null);
  };

  const startEdit = (a: SavedAddress) => {
    setForm({
      firstName: a.first_name,
      lastName: a.last_name ?? "",
      email: a.email ?? "",
      phone: a.phone ?? "",
      addressLine1: a.address_line1,
      addressLine2: a.address_line2 ?? "",
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      country: a.country,
    });
    setEditingId(a.id);
    setStatus(null);
  };

  const cancel = () => {
    setEditingId(null);
    setStatus(null);
  };

  const change = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await upsertAddress(
        form,
        editingId === "new" ? undefined : (editingId ?? undefined),
      );
      if (res.error) {
        setStatus({ type: "error", message: res.error });
        return;
      }
      setEditingId(null);
      setStatus({ type: "success", message: "Address saved." });
      await load();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteAddress(id);
      if (res.error) {
        setStatus({ type: "error", message: res.error });
        return;
      }
      setStatus({ type: "success", message: "Address removed." });
      await load();
    });
  };

  const makeDefault = (id: string) => {
    startTransition(async () => {
      const res = await setDefaultAddress(id);
      if (res.error) {
        setStatus({ type: "error", message: res.error });
        return;
      }
      await load();
    });
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Address Book</h2>
        <p className={styles.cardSubtitle}>
          Save delivery addresses to check out faster.
        </p>
      </div>

      {status && (
        <div className={`${styles.statusMessage} ${styles[status.type]}`}>
          {status.message}
        </div>
      )}

      {loadingList ? (
        <p className={styles.cardSubtitle}>Loading addresses…</p>
      ) : (
        <>
          {addresses.length === 0 && editingId === null && (
            <p className={styles.cardSubtitle} style={{ marginBottom: 16 }}>
              You have no saved addresses yet.
            </p>
          )}

          {addresses.length > 0 && (
            <ul className={styles.addrList}>
              {addresses.map((a) => (
                <li key={a.id} className={styles.addrItem}>
                  <div className={styles.addrInfo}>
                    <div className={styles.addrName}>
                      {a.first_name} {a.last_name}
                      {a.is_default && (
                        <span className={styles.addrBadge}>Default</span>
                      )}
                    </div>
                    <div className={styles.addrText}>
                      {a.address_line1}
                      {a.address_line2 ? `, ${a.address_line2}` : ""}, {a.city},{" "}
                      {a.state} {a.postal_code}, {a.country}
                    </div>
                    {a.phone && (
                      <div className={styles.addrText}>{a.phone}</div>
                    )}
                  </div>
                  <div className={styles.addrActions}>
                    {!a.is_default && (
                      <button
                        type="button"
                        className={styles.addrBtn}
                        onClick={() => makeDefault(a.id)}
                        disabled={isPending}
                      >
                        Set default
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.addrBtn}
                      onClick={() => startEdit(a)}
                      disabled={isPending}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.addrBtnDanger}
                      onClick={() => remove(a.id)}
                      disabled={isPending}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editingId === null ? (
            <button
              type="button"
              className={styles.addrAddBtn}
              onClick={startAdd}
            >
              + Add a new address
            </button>
          ) : (
            <form onSubmit={submit} className={styles.form}>
              <div className={styles.addrTwoCol}>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-firstName">
                    First Name
                  </label>
                  <input
                    id="ab-firstName"
                    name="firstName"
                    className={styles.input}
                    value={form.firstName}
                    onChange={change}
                    required
                    disabled={isPending}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-lastName">
                    Last Name
                  </label>
                  <input
                    id="ab-lastName"
                    name="lastName"
                    className={styles.input}
                    value={form.lastName}
                    onChange={change}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className={styles.addrTwoCol}>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-email">
                    Email
                  </label>
                  <input
                    id="ab-email"
                    name="email"
                    type="email"
                    className={styles.input}
                    value={form.email}
                    onChange={change}
                    disabled={isPending}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-phone">
                    Phone
                  </label>
                  <input
                    id="ab-phone"
                    name="phone"
                    type="tel"
                    className={styles.input}
                    value={form.phone}
                    onChange={change}
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="ab-addr1">
                  Address Line 1
                </label>
                <input
                  id="ab-addr1"
                  name="addressLine1"
                  className={styles.input}
                  value={form.addressLine1}
                  onChange={change}
                  required
                  disabled={isPending}
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="ab-addr2">
                  Address Line 2 (Optional)
                </label>
                <input
                  id="ab-addr2"
                  name="addressLine2"
                  className={styles.input}
                  value={form.addressLine2}
                  onChange={change}
                  disabled={isPending}
                />
              </div>

              <div className={styles.addrTwoCol}>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-city">
                    City
                  </label>
                  <input
                    id="ab-city"
                    name="city"
                    className={styles.input}
                    value={form.city}
                    onChange={change}
                    required
                    disabled={isPending}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-state">
                    State
                  </label>
                  <input
                    id="ab-state"
                    name="state"
                    className={styles.input}
                    value={form.state}
                    onChange={change}
                    required
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className={styles.addrTwoCol}>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-postal">
                    Postal Code
                  </label>
                  <input
                    id="ab-postal"
                    name="postalCode"
                    className={styles.input}
                    value={form.postalCode}
                    onChange={change}
                    required
                    disabled={isPending}
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="ab-country">
                    Country
                  </label>
                  <input
                    id="ab-country"
                    name="country"
                    className={styles.input}
                    value={form.country}
                    onChange={change}
                    required
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className={styles.addrFormActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={cancel}
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.addrSaveBtn}
                  disabled={isPending}
                >
                  {isPending ? "Saving…" : "Save address"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
