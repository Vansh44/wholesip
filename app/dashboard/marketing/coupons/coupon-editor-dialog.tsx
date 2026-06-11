/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import {
  createCoupon,
  updateCoupon,
  type CouponFormData,
} from "@/app/actions/coupon-actions";
import type { Coupon } from "./page";

type Props = {
  open: boolean;
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
};

const EMPTY: CouponFormData = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: 10,
  min_order_amount: 0,
  max_uses: 0,
  valid_from: "",
  valid_until: "",
  status: "active",
};

const fieldClass =
  "w-full rounded-md border border-[rgba(255,255,255,0.1)] bg-[#0e1118] px-3 py-2 text-sm text-[#e8ecf4] outline-none placeholder:text-[#5b6478] focus:border-[#6366f1]";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#8b93a8]";

// ISO timestamp -> yyyy-mm-dd for <input type="date">.
function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function CouponEditorDialog({ open, coupon, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CouponFormData>(EMPTY);
  const [isPending, startTransition] = useTransition();
  const isEditing = !!coupon;

  useEffect(() => {
    if (!open) return;
    if (coupon) {
      setForm({
        code: coupon.code,
        description: coupon.description ?? "",
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        min_order_amount: coupon.min_order_amount,
        max_uses: coupon.max_uses,
        valid_from: toDateInput(coupon.valid_from),
        valid_until: toDateInput(coupon.valid_until),
        status: coupon.status,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, coupon]);

  const set = <K extends keyof CouponFormData>(
    key: K,
    value: CouponFormData[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const isPercentage = form.discount_type === "percentage";

  const handleSave = () => {
    if (!form.code.trim()) {
      toast.error("Coupon code is required");
      return;
    }
    startTransition(async () => {
      const result = isEditing
        ? await updateCoupon(coupon!.id, form)
        : await createCoupon(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Coupon updated" : "Coupon created");
        onSaved();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[#e8ecf4]">
            {isEditing ? "Edit Coupon" : "New Coupon"}
          </DialogTitle>
          <DialogDescription className="text-[#8b93a8]">
            Discount codes shoppers can apply in the cart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className={labelClass}>Code *</label>
            <input
              className={`${fieldClass} font-mono uppercase`}
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER25"
            />
            <p className="mt-1 text-[11px] text-[#5b6478]">
              Case-insensitive. Shoppers type this exactly.
            </p>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <input
              className={fieldClass}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional — internal note (e.g. Summer sale)"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Discount type</label>
              <select
                className={fieldClass}
                value={form.discount_type}
                onChange={(e) =>
                  set("discount_type", e.target.value as "percentage" | "fixed")
                }
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                {isPercentage ? "Percent off" : "Amount off (₹)"} *
              </label>
              <NumberField
                className={fieldClass}
                value={form.discount_value}
                onValueChange={(n) => set("discount_value", n)}
                allowDecimal={!isPercentage}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Min order (₹)</label>
              <NumberField
                className={fieldClass}
                value={form.min_order_amount}
                onValueChange={(n) => set("min_order_amount", n)}
                allowDecimal={false}
              />
              <p className="mt-1 text-[11px] text-[#5b6478]">0 = no minimum</p>
            </div>
            <div>
              <label className={labelClass}>Max uses</label>
              <NumberField
                className={fieldClass}
                value={form.max_uses}
                onValueChange={(n) => set("max_uses", n)}
                allowDecimal={false}
              />
              <p className="mt-1 text-[11px] text-[#5b6478]">0 = unlimited</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Valid from</label>
              <input
                type="date"
                className={fieldClass}
                value={form.valid_from}
                onChange={(e) => set("valid_from", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Valid until</label>
              <input
                type="date"
                className={fieldClass}
                value={form.valid_until}
                onChange={(e) => set("valid_until", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Status</label>
            <select
              className={fieldClass}
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as "active" | "disabled")
              }
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : "Create Coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
