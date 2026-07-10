import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { loadInvoiceForCustomer } from "@/lib/billing/invoice-data";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { PrintInvoiceButton } from "@/components/invoice/print-button";

export const metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

export default async function CustomerInvoicePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // Storefront page — guard the host itself (unknown subdomain → 404, never
  // the fallback store), per the resolve.ts rule for (storefront) pages.
  const storeId = await requireStorefrontStoreId();
  const { orderId } = await params;
  const data = await loadInvoiceForCustomer(orderId);
  // Unknown / not-yours order → 404 (RLS already scoped the read to own
  // orders). The order must also belong to THIS host's store — an order is
  // only viewable on the storefront it was placed on.
  if (!data || data.storeId !== storeId) notFound();

  return (
    <main className="invoice-wrap" style={{ paddingTop: 96 }}>
      <div className="invoice-toolbar invoice-noprint">
        <Link href="/shop" className="invoice-back-btn">
          ← Continue shopping
        </Link>
        <PrintInvoiceButton label="Print / Save PDF" />
      </div>
      <InvoiceDocument
        order={data.order}
        items={data.items}
        billing={data.billing}
      />
    </main>
  );
}
