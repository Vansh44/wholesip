import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "../../lib/access";
import { getProductEditData } from "../data";
import { ProductEditPanel } from "../product-edit-panel";

// Full-page product editor — rendered on a direct visit / refresh / shared link
// (when the @modal interceptor doesn't apply). Editing requires manage.
export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("products", "manage");
  const { id } = await params;
  const data = await getProductEditData(id);
  if (!data) notFound();

  return (
    <div className="dash-page-enter">
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ marginBottom: 12 }}>
          <Link
            href="/dashboard/products"
            className="dash-btn dash-btn-ghost dash-btn-sm"
          >
            ← Back to products
          </Link>
        </div>
        <ProductEditPanel
          product={data.product}
          categories={data.categories}
          colors={data.colors}
        />
      </div>
    </div>
  );
}
