import Link from "next/link";
import { PackageSearch } from "lucide-react";

// Dashboard-scoped 404. Without this, any notFound() inside /dashboard/* (e.g.
// a product/order that can't be loaded) bubbles all the way to the ROOT
// not-found — which says "This store doesn't exist" and drops the dashboard
// chrome, badly misleading an operator whose store is perfectly fine. This
// boundary keeps them inside the dashboard with an accurate message.
export const metadata = { title: "Not found" };

export default function DashboardNotFound() {
  return (
    <div className="dash-page-enter flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "var(--dash-surface-2, rgba(0,0,0,0.06))" }}
        >
          <PackageSearch
            className="h-6 w-6"
            style={{ color: "var(--dash-text-3)" }}
          />
        </div>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--dash-text)" }}
        >
          We couldn&apos;t find that
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--dash-text-3)" }}>
          This item may have been deleted, or you may not have access to it on
          this store. It hasn&apos;t affected the rest of your dashboard.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            href="/dashboard/products"
            className="dash-btn dash-btn-primary"
          >
            Back to products
          </Link>
          <Link href="/dashboard" className="dash-btn dash-btn-ghost">
            Dashboard home
          </Link>
        </div>
      </div>
    </div>
  );
}
