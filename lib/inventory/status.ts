// ---------------------------------------------------------------------------
// Stock-status resolution — the SINGLE source of truth for turning a SKU's
// stock fields into a display status. Used by the dashboard inventory list, its
// optimistic UI, and the storefront badges (product cards + detail page) so the
// per-SKU threshold override and the store-wide default fallback resolve
// IDENTICALLY everywhere. Previously each surface reimplemented this and the
// storefront forgot the store default entirely, so "Only X left" never showed
// unless a per-SKU threshold happened to be set.
//
// Pure module (no server/React imports) so it is shared by server components,
// client components, server actions, and tests alike.
// ---------------------------------------------------------------------------

export type StockDisplayStatus = "in" | "low" | "out" | "untracked";

// The minimal stock shape shared by products and variants (snake_case to match
// the DB rows and storefront DTOs).
export interface StockFields {
  track_inventory: boolean;
  stock: number;
  low_stock_threshold: number | null;
  allow_backorder: boolean;
}

// A SKU's effective low-stock threshold: its own override, else the store
// default. A null override (the common case) means "use the store default".
export function effectiveLowStockThreshold(
  threshold: number | null,
  storeDefault: number,
): number {
  return threshold ?? storeDefault;
}

// Storefront: can the shopper NOT buy this SKU right now? Backorder keeps a
// zero-stock SKU sellable, so it is only "sold out" when tracked, not
// backorderable, and empty.
export function isSoldOut(sku: StockFields): boolean {
  return sku.track_inventory && !sku.allow_backorder && sku.stock <= 0;
}

// Storefront: the most a shopper may add for a SKU. Capped at the available
// stock ONLY when the SKU is tracked and can't backorder; otherwise it is
// effectively unlimited, bounded by a sane UI ceiling. Mirrors the checkout
// guard (reserve_stock), so the quantity selector never lets a shopper pick more
// than they could actually buy — and never wrongly caps an untracked or
// backorderable SKU at its (possibly zero) stock.
export function maxPurchasable(sku: StockFields, ceiling = 99): number {
  if (sku.track_inventory && !sku.allow_backorder) {
    return Math.max(0, Math.min(sku.stock, ceiling));
  }
  return ceiling;
}

// A cart line's inventory snapshot (camelCase, to match CartItem and the
// storefront DTOs). All fields optional so older persisted carts — and callers
// with no stock data — still parse; an absent `trackInventory` means "unknown ⇒
// treat as untracked (unlimited)", leaving the server-side reserve_stock guard
// as the final word rather than silently zeroing a valid line.
export interface CartStockSnapshot {
  trackInventory?: boolean;
  stock?: number;
  allowBackorder?: boolean;
}

// The most a shopper may hold in the cart for a single line — the camelCase
// cart counterpart of maxPurchasable(). Shared by the CartProvider clamp and
// every quantity stepper so "you can never exceed available stock" resolves
// identically across the quick-add button, the detail page, the drawer, and the
// cart page.
export function cartLineMax(snap: CartStockSnapshot, ceiling = 99): number {
  return maxPurchasable(
    {
      track_inventory: snap.trackInventory ?? false,
      stock: snap.stock ?? 0,
      low_stock_threshold: null,
      allow_backorder: snap.allowBackorder ?? false,
    },
    ceiling,
  );
}

// Storefront: the "Only N left" count when a tracked, in-stock SKU is at or
// under its effective threshold; null when no low-stock badge should show.
export function lowStockLeft(
  sku: StockFields,
  storeDefault: number,
): number | null {
  if (!sku.track_inventory || sku.stock <= 0) return null;
  const threshold = effectiveLowStockThreshold(
    sku.low_stock_threshold,
    storeDefault,
  );
  return sku.stock <= threshold ? sku.stock : null;
}

// Dashboard status. Backorder-INDEPENDENT: admins want to see 'out' at zero even
// for a backorderable SKU (it can still sell, but they should know it's empty).
export function inventoryStatus(
  sku: StockFields,
  storeDefault: number,
): StockDisplayStatus {
  if (!sku.track_inventory) return "untracked";
  if (sku.stock <= 0) return "out";
  const threshold = effectiveLowStockThreshold(
    sku.low_stock_threshold,
    storeDefault,
  );
  return sku.stock <= threshold ? "low" : "in";
}

// --- Product-level aggregation for storefront cards (no variant selected) ---

// Sold out at the product level: with variants, every variant must be sold out;
// otherwise use the product's own fields.
export function productIsSoldOut(
  variants: StockFields[],
  product: StockFields,
): boolean {
  if (variants.length > 0) return variants.every(isSoldOut);
  return isSoldOut(product);
}

// "Only N left" at the product level for a card. For a variant product we only
// surface a low-stock signal when there is NO unlimited supply path (every
// variant is tracked and can't backorder); N is then the total remaining across
// variants, compared against the store default (per-variant thresholds don't
// compose into a total). This avoids a false "low" when any variant is
// untracked or backorderable.
export function productLowStockLeft(
  variants: StockFields[],
  product: StockFields,
  storeDefault: number,
): number | null {
  if (variants.length === 0) return lowStockLeft(product, storeDefault);
  if (variants.some((v) => !v.track_inventory || v.allow_backorder))
    return null;
  const total = variants.reduce((sum, v) => sum + Math.max(0, v.stock), 0);
  if (total <= 0 || total > storeDefault) return null;
  return total;
}
