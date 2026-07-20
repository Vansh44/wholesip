import { notFound } from "next/navigation";
import Link from "next/link";
import { requireSectionAccess } from "@/app/dashboard/lib/access";
import { loadInvoiceByStore } from "@/lib/billing/invoice-data";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { PrintInvoiceButton } from "@/components/invoice/print-button";

export const metadata = { title: "Invoice" };

export default async function DashboardInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("orders", "view");
  const { id } = await params;
  const data = await loadInvoiceByStore(id);
  if (!data) notFound();

  return (
    <div className="invoice-wrap">
      <div className="invoice-toolbar invoice-noprint">
        <Link href="/dashboard/orders" className="invoice-back-btn">
          ← Orders
        </Link>
        <PrintInvoiceButton />
      </div>
      <InvoiceDocument
        order={data.order}
        items={data.items}
        billing={data.billing}
      />
    </div>
  );
}
