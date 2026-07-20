import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { cardColors, categories, products, taxClasses } from "@/drizzle/schema";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import { PRODUCT_COLUMNS, VARIANT_COLUMNS } from "./columns";
import { productVariants } from "@/drizzle/schema";
import type {
  Product,
  CategoryOption,
  CardColorOption,
  TaxClassOption,
} from "./page";

/**
 * Everything the product editor needs for one product: the product (with its
 * category + variants) plus the category, card-colour and tax-class option
 * lists. Returns null if the product doesn't exist for this store. Service
 * scope + explicit store filter (the editor needs drafts too), mirroring the
 * list page.
 */
export async function getProductEditData(id: string): Promise<{
  product: Product;
  categories: CategoryOption[];
  colors: CardColorOption[];
  taxClasses: TaxClassOption[];
} | null> {
  const storeId = await getActingStoreId();

  try {
    return await withService(async (db) => {
      const [productRows, variants, categoryRows, colorRows, taxClassRows] =
        await Promise.all([
          db
            .select({
              ...PRODUCT_COLUMNS,
              cat_id: categories.id,
              cat_name: categories.name,
              cat_slug: categories.slug,
            })
            .from(products)
            .leftJoin(categories, eq(products.categoryId, categories.id))
            .where(and(eq(products.id, id), eq(products.storeId, storeId)))
            .limit(1),
          db
            .select(VARIANT_COLUMNS)
            .from(productVariants)
            .where(eq(productVariants.productId, id))
            .orderBy(asc(productVariants.sortOrder)),
          db
            .select({
              id: categories.id,
              name: categories.name,
              slug: categories.slug,
              status: categories.status,
            })
            .from(categories)
            .where(eq(categories.storeId, storeId))
            .orderBy(asc(categories.sortOrder), asc(categories.name)),
          db
            .select({
              id: cardColors.id,
              name: cardColors.name,
              hex: cardColors.hex,
            })
            .from(cardColors)
            .where(eq(cardColors.storeId, storeId))
            .orderBy(asc(cardColors.sortOrder), asc(cardColors.name)),
          db
            .select({
              id: taxClasses.id,
              name: taxClasses.name,
              rate: taxClasses.rate,
            })
            .from(taxClasses)
            .where(eq(taxClasses.storeId, storeId))
            .orderBy(asc(taxClasses.sortOrder), asc(taxClasses.name)),
        ]);

      const row = productRows[0];
      if (!row) {
        // Don't swallow the reason: a null here renders a 404. If the row
        // exists (it usually does), the culprit is almost always a store_id
        // mismatch — this log makes it obvious.
        console.error(
          `getProductEditData: no product for id=${id} store=${storeId} (0 rows matched)`,
        );
        return null;
      }

      const { cat_id, cat_name, cat_slug, ...productFields } = row;
      const product = {
        ...productFields,
        category: cat_id
          ? { id: cat_id, name: cat_name!, slug: cat_slug! }
          : null,
        variants,
      } as unknown as Product;

      return {
        product,
        categories: categoryRows as CategoryOption[],
        colors: colorRows as CardColorOption[],
        taxClasses: taxClassRows as TaxClassOption[],
      };
    });
  } catch (err) {
    console.error(
      "getProductEditData:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
