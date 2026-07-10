"use client";

import { useState } from "react";
import { saveStoreBranding } from "@/app/actions/store-branding";
import type { StoreBrand } from "@/lib/store/brand";
import { ImageUpload } from "@/components/ui/image-upload";
import "./branding.css";

export function BrandingForm({
  initial,
  canManage,
}: {
  initial: StoreBrand;
  canManage: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl || "");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setStatus(null);
    const res = await saveStoreBranding(new FormData(e.currentTarget));
    setSaving(false);
    setStatus(
      res.error
        ? { ok: false, msg: res.error }
        : { ok: true, msg: "Branding saved." },
    );
  }

  const field = (
    name: string,
    label: string,
    value: string | null,
    opts: { type?: string; placeholder?: string; full?: boolean } = {},
  ) => (
    <div className={`brandingField${opts.full ? " full" : ""}`}>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={opts.type ?? "text"}
        defaultValue={value ?? ""}
        placeholder={opts.placeholder}
        disabled={!canManage}
      />
    </div>
  );

  return (
    <form className="brandingPage" onSubmit={onSubmit}>
      <h1>Branding</h1>
      <p className="lead">
        How your store looks to customers — logo, name, colours, contact details
        and social links.
      </p>

      <div className="brandingSection">
        <h2>Identity</h2>
        <div className="brandingGrid">
          {field("name", "Store name", initial.name)}
          {field("tagline", "Tagline", initial.tagline, {
            placeholder: "Short line shown in the browser tab",
          })}
          <div className="brandingField full">
            <label>Logo</label>
            <input type="hidden" name="logoUrl" value={logoUrl} />
            <ImageUpload
              defaultImage={logoUrl}
              onUploadSuccess={setLogoUrl}
              folder="dashboard-uploads"
            />
          </div>
          <div className="brandingField">
            <label htmlFor="primaryColor">Primary colour</label>
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              defaultValue={initial.primaryColor}
              disabled={!canManage}
            />
          </div>
        </div>
      </div>

      <div className="brandingSection">
        <h2>Footer</h2>
        <div className="brandingGrid">
          {field("blurb", "About blurb", initial.blurb, {
            placeholder: "A sentence about your brand",
            full: true,
          })}
          {field("legalName", "Legal name (copyright)", initial.legalName, {
            placeholder: "Acme Foods Pvt. Ltd.",
          })}
          {field("creditLine", "Credit line", initial.creditLine, {
            placeholder: "Powered by StoreMink",
          })}
        </div>
      </div>

      <div className="brandingSection">
        <h2>Contact</h2>
        <div className="brandingGrid">
          {field("email", "Email", initial.email, { type: "email" })}
          {field("phone", "Phone", initial.phone, {
            placeholder: "+91 98765 43210",
          })}
          {field("hours", "Hours", initial.hours, {
            placeholder: "Mon–Sat, 10am–6pm IST",
          })}
        </div>
      </div>

      <div className="brandingSection">
        <h2>Social links</h2>
        <div className="brandingGrid">
          {field("instagram", "Instagram URL", initial.social.instagram)}
          {field("youtube", "YouTube URL", initial.social.youtube)}
          {field("whatsapp", "WhatsApp link", initial.social.whatsapp, {
            placeholder: "https://wa.me/91…",
          })}
        </div>
      </div>

      {canManage && (
        <div className="brandingBar">
          <button className="brandingSave" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save branding"}
          </button>
          {status && (
            <span className={`brandingStatus ${status.ok ? "ok" : "bad"}`}>
              {status.msg}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
