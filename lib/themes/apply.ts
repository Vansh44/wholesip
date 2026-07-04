import { randomUUID } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG } from "@/lib/store/resolve";
import { TAGS } from "@/lib/storefront/tags";
import { sanitizeBlogContent } from "@/lib/sanitize";
import {
  validateSections,
  type PageSectionItem,
  type RichTextConfig,
} from "@/lib/sections/registry";
import { getThemeDefinition } from "./index";
import type { ThemeDefinition } from "./types";

// ---------------------------------------------------------------------------
// applyTheme — seed (or re-seed) a store with a theme package: settings/brand,
// sample categories + products (+variants), menus, and pages (published).
//
// Design:
//  • SERVICE-ROLE client, every write explicitly store-scoped (same trust
//    model as page-actions). Callers are trusted server code only: createStore
//    at signup, and the platform-operator seedDemoStore action.
//  • BEST-EFFORT per entity with an errors accumulator — entities are
//    independent (a store with products but a failed page is still coherent),
//    and every write is an idempotent upsert keyed on (store_id, slug), so
//    re-running applyTheme heals a partial apply.
//  • reset:true (demo stores only — refuses unless settings.demo === true)
//    clears the store's catalog/menus/pages first so demos stay theme-pristine.
// ---------------------------------------------------------------------------

export interface ApplyThemeResult {
  success: boolean;
  errors: string[];
}

export async function applyTheme(
  storeId: string,
  themeId: unknown,
  {
    publish,
    actorUserId = null,
    reset = false,
  }: { publish: boolean; actorUserId?: string | null; reset?: boolean },
): Promise<ApplyThemeResult> {
  const theme = getThemeDefinition(themeId);
  const admin = createAdminClient();
  const errors: string[] = [];
  const fail = (step: string, message: string) => {
    console.error(`applyTheme(${theme.id}) ${step}:`, message);
    errors.push(`${step}: ${message}`);
  };

  // --- settings merge (template + brand accents; NEVER the store's name) ----
  const { data: store, error: storeError } = await admin
    .from("stores")
    .select("settings")
    .eq("id", storeId)
    .single();
  if (storeError || !store) {
    return { success: false, errors: [`store lookup: ${storeError?.message}`] };
  }
  const settings = ((store.settings as Record<string, unknown>) ??
    {}) as Record<string, unknown>;

  if (reset && settings.demo !== true) {
    return {
      success: false,
      errors: ["reset refused: store is not a demo store (settings.demo)"],
    };
  }

  const existingBrand = (settings.brand as Record<string, unknown>) ?? {};
  const mergedSettings = {
    ...settings,
    template: theme.id,
    brand: {
      ...existingBrand, // keeps the merchant's chosen name/logo
      primaryColor: theme.brand.primaryColor,
      tagline: existingBrand.tagline ?? theme.brand.tagline ?? null,
      blurb: existingBrand.blurb ?? theme.brand.blurb ?? null,
    },
  };
  {
    const { error } = await admin
      .from("stores")
      .update({ settings: mergedSettings })
      .eq("id", storeId);
    if (error) fail("settings", error.message);
  }

  // --- reset (demo reseed) ---------------------------------------------------
  if (reset) {
    // products cascade their variants (FK); pages/menus/categories are flat.
    for (const table of [
      "products",
      "categories",
      "store_pages",
      "store_menus",
    ]) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("store_id", storeId);
      if (error) fail(`reset ${table}`, error.message);
    }
  }

  // --- sample categories + products ------------------------------------------
  const categoryIdBySlug = new Map<string, string>();
  if (theme.sampleData) {
    for (const c of theme.sampleData.categories) {
      const { data, error } = await admin
        .from("categories")
        .upsert(
          {
            store_id: storeId,
            name: c.name,
            slug: c.slug,
            description: c.description ?? null,
            image_url: c.image_url ?? null,
            sort_order: c.sort_order ?? 0,
            status: "active",
          },
          { onConflict: "store_id,slug" },
        )
        .select("id, slug")
        .single();
      if (error || !data) {
        fail(`category ${c.slug}`, error?.message ?? "no row");
        continue;
      }
      categoryIdBySlug.set(data.slug, data.id);
    }

    for (const p of theme.sampleData.products) {
      const { data, error } = await admin
        .from("products")
        .upsert(
          {
            store_id: storeId,
            name: p.name,
            slug: p.slug,
            description: p.description,
            category_id: categoryIdBySlug.get(p.category_slug) ?? null,
            base_price: p.base_price,
            selling_price: p.selling_price,
            image_url: p.image_url,
            images: p.images ?? [],
            status: "published",
            featured: p.featured ?? false,
            sort_order: p.sort_order ?? 0,
            card_color: p.card_color ?? null,
            published_at: new Date().toISOString(),
            created_by: actorUserId,
            updated_by: actorUserId,
          },
          { onConflict: "store_id,slug" },
        )
        .select("id")
        .single();
      if (error || !data) {
        fail(`product ${p.slug}`, error?.message ?? "no row");
        continue;
      }

      // Replace variants (mirrors product-actions' replaceVariants).
      const { error: delError } = await admin
        .from("product_variants")
        .delete()
        .eq("store_id", storeId)
        .eq("product_id", data.id);
      if (delError) fail(`variants(clear) ${p.slug}`, delError.message);

      const variants = (p.variants ?? []).map((v, i) => ({
        store_id: storeId,
        product_id: data.id,
        name: v.name,
        base_price: v.base_price,
        selling_price: v.selling_price,
        special_price: v.special_price ?? null,
        stock: v.stock,
        sku: v.sku ?? null,
        sort_order: v.sort_order ?? i,
        images: v.images ?? [],
      }));
      if (variants.length > 0) {
        const { error: insError } = await admin
          .from("product_variants")
          .insert(variants);
        if (insError) fail(`variants ${p.slug}`, insError.message);
      }
    }
  }

  // --- menus -------------------------------------------------------------------
  {
    const { error } = await admin.from("store_menus").upsert(
      {
        store_id: storeId,
        header: theme.menus.header,
        footer_groups: theme.menus.footerGroups,
        footer_legal: theme.menus.footerLegal,
        updated_by: actorUserId,
      },
      { onConflict: "store_id" },
    );
    if (error) fail("menus", error.message);
  }

  // --- pages ---------------------------------------------------------------------
  for (const page of theme.pages) {
    const sections = prepareSections(theme, page.slug);
    if ("error" in sections) {
      fail(`page ${page.slug || "(home)"}`, sections.error);
      continue;
    }
    const row: Record<string, unknown> = {
      store_id: storeId,
      slug: page.slug,
      title: page.title,
      seo_title: page.seo_title ?? "",
      seo_description: page.seo_description ?? "",
      seo_noindex: false,
      sections: sections.sections,
      created_by: actorUserId,
      updated_by: actorUserId,
    };
    if (publish) {
      row.published_sections = sections.sections;
      row.status = "published";
      row.published_at = new Date().toISOString();
    }
    const { error } = await admin
      .from("store_pages")
      .upsert(row, { onConflict: "store_id,slug" });
    if (error) fail(`page ${page.slug || "(home)"}`, error.message);
  }

  // --- cache busting -----------------------------------------------------------
  revalidateTag(STORE_TAG, "max");
  revalidateTag(TAGS.pages, "max");
  revalidateTag(TAGS.products, "max");
  revalidateTag(TAGS.categories, "max");
  revalidateTag(TAGS.menus, "max");
  revalidatePath("/");

  return { success: errors.length === 0, errors };
}

/**
 * Validate a theme page's sections (strict publish mode), regenerate ids as
 * real UUIDs, and sanitize rich_text HTML — the same server rules every other
 * write path applies.
 */
function prepareSections(
  theme: ThemeDefinition,
  pageSlug: string,
): { sections: PageSectionItem[] } | { error: string } {
  const page = theme.pages.find((p) => p.slug === pageSlug);
  if (!page) return { error: "page missing from theme" };

  const withIds = page.sections.map((s) => ({ ...s, id: randomUUID() }));
  const validated = validateSections(withIds, { mode: "publish" });
  if ("error" in validated) return validated;

  return {
    sections: validated.sections.map((s) =>
      s.type === "rich_text"
        ? {
            ...s,
            config: {
              ...(s.config as RichTextConfig),
              html: sanitizeBlogContent((s.config as RichTextConfig).html),
            },
          }
        : s,
    ),
  };
}
