"use client";

import { Printer } from "lucide-react";

// Small client control — the invoice document itself is a server component.
export function PrintInvoiceButton({ label = "Print / Save PDF" }) {
  return (
    <button
      type="button"
      className="invoice-print-btn"
      onClick={() => window.print()}
    >
      <Printer size={16} />
      {label}
    </button>
  );
}
