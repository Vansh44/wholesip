import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { THEME_DEFINITIONS, getThemeDefinition } from "./index";
import { THEME_META, DEFAULT_THEME_ID } from "./meta";
import { designToCssVars } from "./types";
import { validateSections, validatePageSlug } from "@/lib/sections/registry";

// Every palette slot a theme MUST fill (accent/accentDeep are optional — the
// --brand-primary chain drives them). Mirrors ThemePalette in types.ts.
const REQUIRED_PALETTE_KEYS = [
  "cream",
  "creamDeep",
  "surface",
  "ink",
  "inkSoft",
  "inkFaint",
  "taupe",
  "sand",
  "butter",
  "border",
  "tile",
  "accentWarm",
  "onAccent",
  "onInk",
  "shadowRgb",
  "success",
  "successSoft",
  "error",
  "errorSoft",
  "star",
  "highlight",
] as const;

// A CSS colour value we're willing to inject into a style attribute: a hex,
// or a "r, g, b" triple (shadowRgb). Fonts must reference a loaded --font-*.
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const RGB_TRIPLE_RE = /^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/;

// ---------------------------------------------------------------------------
// CI guards for theme packages: every theme must seed cleanly (strict publish
// validation), stay inside the v1 constraints (no id-based sources, no blog
// sections), and reference only bundled images that actually exist.
// ---------------------------------------------------------------------------

describe("theme registry", () => {
  it("meta and definitions stay in sync", () => {
    expect(THEME_DEFINITIONS.map((t) => t.id).sort()).toEqual(
      THEME_META.map((t) => t.id).sort(),
    );
    expect(getThemeDefinition("nope").id).toBe(DEFAULT_THEME_ID);
    expect(getThemeDefinition(undefined).id).toBe(DEFAULT_THEME_ID);
  });

  for (const theme of THEME_DEFINITIONS) {
    describe(`theme: ${theme.id}`, () => {
      it("includes the homepage sentinel and valid page slugs", () => {
        expect(theme.pages.some((p) => p.slug === "")).toBe(true);
        for (const p of theme.pages) {
          if (p.slug === "") continue;
          expect(validatePageSlug(p.slug), p.slug).toEqual({ slug: p.slug });
        }
      });

      it("every page passes STRICT publish validation", () => {
        for (const p of theme.pages) {
          const r = validateSections(p.sections, { mode: "publish" });
          expect(
            "sections" in r,
            `${theme.id}/${p.slug || "(home)"}: ${"error" in r ? r.error : ""}`,
          ).toBe(true);
        }
      });

      it("uses only non-id sources and no blog sections (v1 constraint)", () => {
        for (const p of theme.pages) {
          for (const s of p.sections) {
            expect(s.type, `${p.slug}/${s.id}`).not.toBe("latest_blogs");
            const c = s.config as unknown as Record<string, unknown>;
            if (s.type === "featured_products") {
              expect(c.source).toBe("featured");
              expect(c.product_ids).toEqual([]);
            }
            if (s.type === "shop_by_category") {
              expect(c.source).toBe("all");
            }
          }
        }
      });

      it("sample product/category slugs are unique and cross-linked", () => {
        const sample = theme.sampleData;
        if (!sample) return;
        const catSlugs = sample.categories.map((c) => c.slug);
        expect(new Set(catSlugs).size).toBe(catSlugs.length);
        const productSlugs = sample.products.map((p) => p.slug);
        expect(new Set(productSlugs).size).toBe(productSlugs.length);
        for (const p of sample.products) {
          expect(catSlugs, `${p.slug} → ${p.category_slug}`).toContain(
            p.category_slug,
          );
        }
        // Featured sections need featured products to look alive.
        expect(sample.products.some((p) => p.featured)).toBe(true);
      });

      it("every referenced image exists under public/", () => {
        const urls = new Set<string>([theme.previewImage]);
        for (const p of theme.sampleData?.products ?? []) {
          urls.add(p.image_url);
          for (const u of p.images ?? []) urls.add(u);
        }
        for (const c of theme.sampleData?.categories ?? []) {
          if (c.image_url) urls.add(c.image_url);
        }
        for (const page of theme.pages) {
          for (const s of page.sections) {
            const img = (s.config as { image_url?: string }).image_url;
            if (img) urls.add(img);
            // tile_grid nests its images per tile.
            const tiles = (s.config as { tiles?: { image_url?: string }[] })
              .tiles;
            for (const t of tiles ?? []) {
              if (t.image_url) urls.add(t.image_url);
            }
          }
        }
        for (const url of urls) {
          expect(url.startsWith("/themes/"), url).toBe(true);
          expect(
            existsSync(join(process.cwd(), "public", url)),
            `missing asset: public${url}`,
          ).toBe(true);
        }
      });

      it("demo slug follows the demo- convention", () => {
        expect(theme.demoSlug).toBe(`demo-${theme.id}`);
      });

      it("ships a complete, injectable design (palette + fonts + shape)", () => {
        const { palette, fonts, shape } = theme.design;
        for (const key of REQUIRED_PALETTE_KEYS) {
          const v = palette[key];
          expect(typeof v === "string" && v.length > 0, `palette.${key}`).toBe(
            true,
          );
          if (key === "shadowRgb") {
            expect(RGB_TRIPLE_RE.test(v as string), `shadowRgb="${v}"`).toBe(
              true,
            );
          } else {
            expect(COLOR_RE.test(v as string), `${key}="${v}"`).toBe(true);
          }
        }
        // Fonts must point at a next/font variable loaded in app/layout.tsx.
        expect(fonts.body).toMatch(/^var\(--font-[a-z-]+\)$/);
        expect(fonts.display).toMatch(/^var\(--font-[a-z-]+\)$/);
        // Shape values are non-empty CSS lengths.
        for (const k of ["card", "control", "sm", "pill"] as const) {
          expect(shape[k], `shape.${k}`).toMatch(/^\d/);
        }
        // Layout colours are injected inline — strict hex only.
        const layout = theme.design.layout;
        if (layout?.headerBackground) {
          expect(COLOR_RE.test(layout.headerBackground)).toBe(true);
        }
        if (layout?.headerForeground) {
          expect(COLOR_RE.test(layout.headerForeground)).toBe(true);
        }
      });

      it("flattens into the full --sm-* token override set", () => {
        const vars = designToCssVars(theme.design, theme.brand.primaryColor);
        // Core tokens the storefront cascade depends on.
        for (const token of [
          "--sm-cream",
          "--sm-ink",
          "--sm-surface",
          "--sm-on-accent",
          "--sm-shadow-rgb",
          "--font-outfit",
          "--font-stick-no-bills",
          "--sm-radius-card",
        ]) {
          expect(vars[token], token).toBeTruthy();
        }
        // --brand-primary defaults to the store colour when no fixed accent.
        expect(vars["--brand-primary"]).toBe(
          theme.design.palette.accent ?? theme.brand.primaryColor,
        );
      });
    });
  }
});
