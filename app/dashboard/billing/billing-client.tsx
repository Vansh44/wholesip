"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import {
  saveBillingSettings,
  createTaxClass,
  updateTaxClass,
  deleteTaxClass,
} from "@/app/actions/billing-actions";
import type {
  BillingSettings,
  TaxClass,
  InvoiceTemplate,
} from "@/lib/billing/types";
import "./billing.css";

// Mutable form shape (nulls flattened to empty strings for controlled inputs).
interface SettingsState {
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
  defaultTaxClassId: string;
  businessName: string;
  businessAddress: string;
  taxId: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl: string;
  invoicePrefix: string;
  accentColor: string;
  footerNote: string;
  terms: string;
  template: InvoiceTemplate;
}

function toState(s: BillingSettings): SettingsState {
  return {
    taxEnabled: s.taxEnabled,
    pricesIncludeTax: s.pricesIncludeTax,
    defaultTaxClassId: s.defaultTaxClassId ?? "",
    businessName: s.businessName ?? "",
    businessAddress: s.businessAddress ?? "",
    taxId: s.taxId ?? "",
    contactEmail: s.contactEmail ?? "",
    contactPhone: s.contactPhone ?? "",
    logoUrl: s.logoUrl ?? "",
    invoicePrefix: s.invoicePrefix,
    accentColor: s.accentColor,
    footerNote: s.footerNote ?? "",
    terms: s.terms ?? "",
    template: { ...s.template },
  };
}

const TEMPLATE_FLAGS: Array<{ key: keyof InvoiceTemplate; label: string }> = [
  { key: "showLogo", label: "Show logo" },
  { key: "showBusinessAddress", label: "Show business address" },
  { key: "showTaxId", label: "Show tax registration (GSTIN)" },
  { key: "showBillingAddress", label: "Show billing address" },
  { key: "showPaymentMethod", label: "Show payment method" },
  { key: "showNotes", label: "Show order notes" },
];

export function BillingClient({
  initialSettings,
  initialTaxClasses,
  canManage,
}: {
  initialSettings: BillingSettings;
  initialTaxClasses: TaxClass[];
  canManage: boolean;
}) {
  const [classes, setClasses] = useState<TaxClass[]>(initialTaxClasses);
  const [settings, setSettings] = useState<SettingsState>(() =>
    toState(initialSettings),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  function set<K extends keyof SettingsState>(key: K, val: SettingsState[K]) {
    setSettings((s) => ({ ...s, [key]: val }));
    setStatus(null);
  }
  function setFlag(key: keyof InvoiceTemplate, val: boolean) {
    setSettings((s) => ({ ...s, template: { ...s.template, [key]: val } }));
  }

  async function onSaveSettings() {
    if (!canManage) return;
    setSaving(true);
    setStatus(null);
    const res = await saveBillingSettings({
      taxEnabled: settings.taxEnabled,
      pricesIncludeTax: settings.pricesIncludeTax,
      defaultTaxClassId: settings.defaultTaxClassId || null,
      businessName: settings.businessName,
      businessAddress: settings.businessAddress,
      taxId: settings.taxId,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      logoUrl: settings.logoUrl,
      invoicePrefix: settings.invoicePrefix,
      accentColor: settings.accentColor,
      footerNote: settings.footerNote,
      terms: settings.terms,
      template: settings.template,
    });
    setSaving(false);
    setStatus(
      res.error
        ? { ok: false, msg: res.error }
        : { ok: true, msg: "Settings saved." },
    );
  }

  return (
    <div className="billPage">
      <h1>Invoices &amp; Billing</h1>
      <p className="lead">
        Configure tax rules and customise the invoice your customers receive.
      </p>

      {/* ---- Tax configuration ---- */}
      <div className="billSection">
        <h2>Tax</h2>
        <p className="hint">
          Turn on tax to apply it at checkout. Assign a tax class to each
          product (Products → edit); products without one use the default below.
        </p>

        <div className="billToggle">
          <input
            type="checkbox"
            id="taxEnabled"
            checked={settings.taxEnabled}
            onChange={(e) => set("taxEnabled", e.target.checked)}
            disabled={!canManage}
          />
          <div>
            <div className="tLabel">Charge tax on orders</div>
            <div className="tDesc">
              When off, no tax is added and invoices show no tax line.
            </div>
          </div>
        </div>

        <div className={`billToggle${settings.taxEnabled ? "" : " disabled"}`}>
          <input
            type="checkbox"
            id="pricesIncludeTax"
            checked={settings.pricesIncludeTax}
            onChange={(e) => set("pricesIncludeTax", e.target.checked)}
            disabled={!canManage || !settings.taxEnabled}
          />
          <div>
            <div className="tLabel">Prices already include tax</div>
            <div className="tDesc">
              On: the tax is carved out of your listed prices. Off: tax is added
              on top at checkout.
            </div>
          </div>
        </div>

        <div className="billGrid" style={{ marginTop: 14 }}>
          <div className="billField">
            <label htmlFor="defaultTaxClass">Default tax class</label>
            <select
              id="defaultTaxClass"
              value={settings.defaultTaxClassId}
              onChange={(e) => set("defaultTaxClassId", e.target.value)}
              disabled={!canManage}
            >
              <option value="">— None —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.rate}%)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ---- Tax classes ---- */}
      <div className="billSection">
        <h2>Tax classes</h2>
        <p className="hint">
          Named rates you can assign to products (e.g. GST 5%, GST 12%, GST
          18%).
        </p>

        {classes.length === 0 ? (
          <div className="taxEmpty">No tax classes yet. Add one below.</div>
        ) : (
          <div className="taxRows">
            {classes.map((c) => (
              <TaxClassRow
                key={c.id}
                cls={c}
                canManage={canManage}
                onUpdated={(next) =>
                  setClasses((list) =>
                    list.map((x) => (x.id === next.id ? next : x)),
                  )
                }
                onDeleted={(id) => {
                  setClasses((list) => list.filter((x) => x.id !== id));
                  if (settings.defaultTaxClassId === id)
                    set("defaultTaxClassId", "");
                }}
              />
            ))}
          </div>
        )}

        {canManage && (
          <div className="taxAddRow">
            <AddTaxClass onAdded={(c) => setClasses((list) => [...list, c])} />
          </div>
        )}
      </div>

      {/* ---- Business identity ---- */}
      <div className="billSection">
        <h2>Business details</h2>
        <p className="hint">These appear on the invoice header.</p>
        <div className="billGrid">
          <div className="billField">
            <label htmlFor="businessName">Business name</label>
            <input
              id="businessName"
              value={settings.businessName}
              onChange={(e) => set("businessName", e.target.value)}
              placeholder="Acme Foods Pvt. Ltd."
              disabled={!canManage}
            />
          </div>
          <div className="billField">
            <label htmlFor="taxId">Tax registration (GSTIN)</label>
            <input
              id="taxId"
              value={settings.taxId}
              onChange={(e) => set("taxId", e.target.value)}
              placeholder="22AAAAA0000A1Z5"
              disabled={!canManage}
            />
          </div>
          <div className="billField full">
            <label htmlFor="businessAddress">Business address</label>
            <textarea
              id="businessAddress"
              value={settings.businessAddress}
              onChange={(e) => set("businessAddress", e.target.value)}
              placeholder="Street, City, State, PIN"
              disabled={!canManage}
            />
          </div>
          <div className="billField">
            <label htmlFor="contactEmail">Contact email</label>
            <input
              id="contactEmail"
              type="email"
              value={settings.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="billField">
            <label htmlFor="contactPhone">Contact phone</label>
            <input
              id="contactPhone"
              value={settings.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              disabled={!canManage}
            />
          </div>
          <div className="billField full">
            <label>Invoice logo</label>
            <ImageUpload
              defaultImage={settings.logoUrl}
              onUploadSuccess={(url) => set("logoUrl", url)}
              folder="dashboard-uploads"
            />
          </div>
        </div>
      </div>

      {/* ---- Invoice template ---- */}
      <div className="billSection">
        <h2>Invoice template</h2>
        <div className="billGrid">
          <div className="billField">
            <label htmlFor="title">Invoice title</label>
            <input
              id="title"
              value={settings.template.title}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  template: { ...s.template, title: e.target.value },
                }))
              }
              placeholder="Tax Invoice"
              disabled={!canManage}
            />
          </div>
          <div className="billField">
            <label htmlFor="invoicePrefix">Invoice number prefix</label>
            <input
              id="invoicePrefix"
              value={settings.invoicePrefix}
              onChange={(e) => set("invoicePrefix", e.target.value)}
              placeholder="INV"
              disabled={!canManage}
            />
          </div>
          <div className="billField">
            <label htmlFor="accentColor">Accent colour</label>
            <input
              id="accentColor"
              type="color"
              value={settings.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              disabled={!canManage}
            />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {TEMPLATE_FLAGS.map((f) => (
            <div className="billToggle" key={f.key}>
              <input
                type="checkbox"
                id={f.key}
                checked={settings.template[f.key] as boolean}
                onChange={(e) => setFlag(f.key, e.target.checked)}
                disabled={!canManage}
              />
              <div>
                <div className="tLabel">{f.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="billGrid" style={{ marginTop: 14 }}>
          <div className="billField full">
            <label htmlFor="footerNote">Footer note</label>
            <textarea
              id="footerNote"
              value={settings.footerNote}
              onChange={(e) => set("footerNote", e.target.value)}
              placeholder="Thank you for shopping with us!"
              disabled={!canManage}
            />
          </div>
          <div className="billField full">
            <label htmlFor="terms">Terms &amp; conditions</label>
            <textarea
              id="terms"
              value={settings.terms}
              onChange={(e) => set("terms", e.target.value)}
              placeholder="Goods once sold will not be taken back…"
              disabled={!canManage}
            />
          </div>
        </div>
      </div>

      {canManage && (
        <div className="billBar">
          <button
            className="billSave"
            type="button"
            onClick={onSaveSettings}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          {status && (
            <span className={`billStatus ${status.ok ? "ok" : "bad"}`}>
              {status.msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Inline tax-class row ----
function TaxClassRow({
  cls,
  canManage,
  onUpdated,
  onDeleted,
}: {
  cls: TaxClass;
  canManage: boolean;
  onUpdated: (c: TaxClass) => void;
  onDeleted: (id: string) => void;
}) {
  const [name, setName] = useState(cls.name);
  const [rate, setRate] = useState(String(cls.rate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty = name !== cls.name || rate !== String(cls.rate);

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await updateTaxClass(cls.id, {
      name,
      rate: parseFloat(rate) || 0,
    });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    onUpdated({ ...cls, name, rate: parseFloat(rate) || 0 });
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    const res = await deleteTaxClass(cls.id);
    setBusy(false);
    if (res.error) {
      setErr(res.error);
      return;
    }
    onDeleted(cls.id);
  }

  return (
    <div>
      <div className="taxRow">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="GST 18%"
          disabled={!canManage || busy}
        />
        <div className="rate">
          <input
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
            placeholder="18"
            disabled={!canManage || busy}
          />
        </div>
        {canManage && (
          <div className="taxActions">
            <button
              className="taxBtn primary"
              type="button"
              onClick={save}
              disabled={busy || !dirty}
            >
              Save
            </button>
            <button
              className="taxBtn danger"
              type="button"
              onClick={remove}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {err && <div className="billRowError">{err}</div>}
    </div>
  );
}

// ---- Add new tax class ----
function AddTaxClass({ onAdded }: { onAdded: (c: TaxClass) => void }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await createTaxClass({ name, rate: parseFloat(rate) || 0 });
    setBusy(false);
    if (res.error || !res.id) {
      setErr(res.error || "Could not add tax class.");
      return;
    }
    onAdded({
      id: res.id,
      name: name.trim(),
      rate: parseFloat(rate) || 0,
      sortOrder: 0,
    });
    setName("");
    setRate("");
  }

  return (
    <div>
      <div className="taxRow">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New tax class name (e.g. GST 12%)"
          disabled={busy}
        />
        <div className="rate">
          <input
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value)}
            placeholder="12"
            disabled={busy}
          />
        </div>
        <div className="taxActions">
          <button
            className="taxBtn primary"
            type="button"
            onClick={add}
            disabled={busy}
          >
            Add
          </button>
        </div>
      </div>
      {err && <div className="billRowError">{err}</div>}
    </div>
  );
}
