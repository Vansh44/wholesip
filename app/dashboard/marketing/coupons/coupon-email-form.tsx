/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CustomerMultiselect,
  type CustomerOption,
} from "@/components/customer-multiselect";
import {
  generateCouponEmail,
  listEmailRecipients,
  renderCouponEmailPreview,
  sendCouponEmail,
  type EmailAudience,
} from "@/app/actions/coupon-email-actions";
import type { Coupon, CouponGroup } from "./page";

type Props = {
  coupon: Coupon;
  groups: CouponGroup[];
};

type Mode = "all" | "group" | "specific";

const LIST_HREF = "/dashboard/marketing/coupons";

const fieldClass =
  "w-full rounded-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#1f2937] outline-none placeholder:text-[#9ca3af] focus:border-[#4f46e5]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b7280]";

function discountLabelFor(c: Coupon): string {
  return c.discount_type === "percentage"
    ? `${c.discount_value}% off`
    : `₹${c.discount_value.toLocaleString("en-IN")} off`;
}

function validUntilLabel(c: Coupon): string | null {
  if (!c.valid_until) return null;
  const d = new Date(c.valid_until);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CouponEmailForm({ coupon, groups }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("all");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [instructions, setInstructions] = useState("");

  const [generating, setGenerating] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [isSending, startSending] = useTransition();

  useEffect(() => {
    listEmailRecipients().then((res) => {
      setLoadingCustomers(false);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setCustomers(res.customers);
    });
  }, []);

  const withEmailCount = useMemo(
    () => customers.filter((c) => c.email).length,
    [customers],
  );
  const specificWithEmail = useMemo(
    () => customers.filter((c) => selected.has(c.id) && c.email).length,
    [customers, selected],
  );

  const audience: EmailAudience = useMemo(() => {
    if (mode === "group") return { mode: "group", groupId };
    if (mode === "specific")
      return { mode: "specific", customerIds: Array.from(selected) };
    return { mode: "all" };
  }, [mode, groupId, selected]);

  const audienceLabel =
    mode === "group"
      ? (groups.find((g) => g.id === groupId)?.name ?? "a customer group")
      : mode === "specific"
        ? "selected customers"
        : "all customers";

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  useEffect(() => {
    if (!body.trim()) {
      setPreviewHtml("");
      return;
    }
    const handle = setTimeout(async () => {
      const res = await renderCouponEmailPreview({
        subject,
        body,
        code: coupon.code,
        discountLabel: discountLabelFor(coupon),
        validUntilLabel: validUntilLabel(coupon),
        sampleName: customers.find((c) => c.first_name)?.first_name,
      });
      if (res.html) {
        setPreviewHtml(res.html);
        setPreviewSubject(res.subject ?? subject);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [coupon, subject, body, customers]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await generateCouponEmail({
      code: coupon.code,
      description: coupon.description,
      discountLabel: discountLabelFor(coupon),
      validUntilLabel: validUntilLabel(coupon),
      audienceLabel,
      instructions: instructions.trim() || undefined,
    });
    setGenerating(false);
    if (res.error) {
      toast.error(res.error);
    } else if (res.subject && res.body) {
      setSubject(res.subject);
      setBody(res.body);
      toast.success("Draft generated");
    }
  };

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Add a subject and body first");
      return;
    }
    if (mode === "specific" && selected.size === 0) {
      toast.error("Pick at least one customer");
      return;
    }
    if (mode === "group" && !groupId) {
      toast.error("Pick a group");
      return;
    }
    startSending(async () => {
      const res = await sendCouponEmail({
        subject,
        body,
        code: coupon.code,
        discountLabel: discountLabelFor(coupon),
        validUntilLabel: validUntilLabel(coupon),
        audience,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        const skipped = res.skippedNoEmail
          ? ` (${res.skippedNoEmail} skipped — no email)`
          : "";
        toast.success(`Sent to ${res.sent} customer(s)${skipped}`);
        router.push(LIST_HREF);
      }
    });
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header">
        <Link
          href={LIST_HREF}
          className="mb-2 inline-flex items-center gap-1 text-sm text-[#6b7280] hover:text-[#4f46e5]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to coupons
        </Link>
        <h1>Send email — {coupon.code}</h1>
        <p>
          Promote this coupon by email. Write it yourself or generate a draft
          with AI, then preview before sending.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Left: audience + compose ── */}
        <div className="dash-card space-y-4 p-6">
          <div>
            <label className={labelClass}>Audience</label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All customers"],
                  ["group", "A user group"],
                  ["specific", "Specific customers"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    mode === m
                      ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                      : "border-[#e5e7eb] text-[#6b7280] hover:border-[#c7d2fe]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[#9ca3af]">
              {loadingCustomers
                ? "Loading customers…"
                : mode === "all"
                  ? `${withEmailCount} customer(s) with an email will receive this.`
                  : mode === "specific"
                    ? `${specificWithEmail} selected customer(s) with an email.`
                    : "All members of the group with an email will receive this."}
            </p>
          </div>

          {mode === "group" && (
            <div>
              <label className={labelClass}>Group</label>
              {groups.length === 0 ? (
                <p className="text-[11px] text-[#9ca3af]">
                  No user groups yet. Create one under Users → User Groups.
                </p>
              ) : (
                <select
                  className={fieldClass}
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {mode === "specific" && (
            <div>
              <label className={labelClass}>Pick customers</label>
              <CustomerMultiselect
                customers={customers}
                selected={selected}
                onToggle={toggle}
                onSetMany={setMany}
                emailOnly
                maxHeightClass="max-h-[220px]"
              />
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={`${labelClass} mb-0`}>Subject</label>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || isSending}
                title="Generate a draft from your brand guide with AI"
                className="flex items-center gap-1 rounded-md border border-[#c7d2fe] px-2 py-1 text-xs text-[#4f46e5] hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {generating ? "Generating…" : "Generate with AI"}
              </button>
            </div>
            <input
              className={fieldClass}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. A little something for you, {{first_name}}"
            />
          </div>

          <div>
            <label className={labelClass}>Body</label>
            <textarea
              className={`${fieldClass} min-h-[200px] resize-y`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message, or use Generate with AI. Use {{first_name}} to personalise the greeting."
            />
            <p className="mt-1 text-[11px] text-[#9ca3af]">
              The coupon code, discount and validity are added automatically
              below your copy.
            </p>
          </div>

          <div>
            <label className={labelClass}>AI direction (optional)</label>
            <input
              className={fieldClass}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Mention it's a thank-you for loyal customers"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] pt-4">
            <Button
              variant="outline"
              onClick={() => router.push(LIST_HREF)}
              disabled={isSending}
            >
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={isSending || generating}>
              <Mail className="mr-2 h-4 w-4" />
              {isSending ? "Sending…" : "Send email"}
            </Button>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="dash-card p-6">
          <label className={labelClass}>Preview</label>
          <div className="rounded-md border border-[#e5e7eb] bg-[#f4f4f5] p-2">
            {previewSubject && (
              <div className="mb-2 px-1 text-xs text-[#6b7280]">
                <span className="font-medium text-[#374151]">Subject:</span>{" "}
                {previewSubject}
              </div>
            )}
            {previewHtml ? (
              <iframe
                title="Email preview"
                srcDoc={previewHtml}
                className="h-[560px] w-full rounded border border-[#e5e7eb] bg-white"
              />
            ) : (
              <div className="flex h-[560px] items-center justify-center rounded border border-dashed border-[#d1d5db] text-center text-sm text-[#9ca3af]">
                Write a body or generate a draft
                <br />
                to see the preview here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
