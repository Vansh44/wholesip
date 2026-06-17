import { requireSectionAccess } from "../../../lib/access";
import { getProductEditData } from "../../data";
import { ProductEditModal } from "../../product-edit-modal";

// Intercepts /dashboard/products/[id] during in-app navigation and renders the
// editor as a modal over the list. A direct visit / refresh bypasses this and
// renders ../[id]/page.tsx as a full page instead.
export default async function InterceptedProductEdit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("products", "manage");
  const { id } = await params;
  const data = await getProductEditData(id);
  if (!data) return null;
  return (
    <ProductEditModal
      product={data.product}
      categories={data.categories}
      colors={data.colors}
    />
  );
}
