import { describe, it, expect } from "vitest";
import {
  clampLimit,
  validateConfig,
  summarizeSection,
  EMPTY_CONFIG,
  LIMIT_MIN,
  LIMIT_MAX,
  type FeaturedProductsConfig,
  type ShopByCategoryConfig,
  type PromoBannerConfig,
  type LatestBlogsConfig,
} from "./section-types";

// clampLimit() pins the "max products/blogs to show" knob into 1..12, falling
// back to the featured default (8) when the value is garbage. Floats are
// truncated since you can't show 4.7 cards.
describe("clampLimit", () => {
  it("falls back to the featured default for non-finite input", () => {
    expect(clampLimit(Number.NaN)).toBe(EMPTY_CONFIG.featured_products.limit);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(
      EMPTY_CONFIG.featured_products.limit,
    );
    expect(clampLimit(Number.NEGATIVE_INFINITY)).toBe(8);
  });

  it("clamps values below LIMIT_MIN up to 1", () => {
    expect(clampLimit(0)).toBe(LIMIT_MIN);
    expect(clampLimit(-99)).toBe(1);
  });

  it("clamps values above LIMIT_MAX down to 12", () => {
    expect(clampLimit(13)).toBe(LIMIT_MAX);
    expect(clampLimit(1000)).toBe(12);
  });

  it("truncates floats toward zero before clamping", () => {
    expect(clampLimit(4.7)).toBe(4);
    expect(clampLimit(11.9)).toBe(11);
    // 12.9 truncates to 12 which is in range (not bumped to 13 then clamped).
    expect(clampLimit(12.9)).toBe(12);
  });

  it("passes in-range integers through unchanged", () => {
    expect(clampLimit(1)).toBe(1);
    expect(clampLimit(8)).toBe(8);
    expect(clampLimit(12)).toBe(12);
  });
});

// validateConfig() is the trust boundary: it normalises raw editor/form input
// into a clean, storable config (irrelevant keys dropped) or returns an error.
describe("validateConfig", () => {
  it("rejects an unknown section type", () => {
    const out = validateConfig("testimonials" as never, {});
    expect(out).toEqual({ error: "Unknown section type." });
  });

  // --- featured_products ---------------------------------------------------
  describe("featured_products", () => {
    it("defaults source to 'featured' and drops irrelevant keys", () => {
      const out = validateConfig("featured_products", {
        heading: "  Bestsellers  ",
        subheading: "  picks  ",
        // product_ids/category_id are irrelevant for source=featured and must
        // be dropped/nulled.
        product_ids: ["a", "b"],
        category_id: "cat-1",
        limit: 6,
      });
      expect("config" in out).toBe(true);
      const config = (out as { config: FeaturedProductsConfig }).config;
      expect(config).toEqual({
        heading: "Bestsellers",
        subheading: "picks",
        source: "featured",
        product_ids: [],
        category_id: null,
        limit: 6,
      });
    });

    it("errors when source=manual has no product_ids", () => {
      const out = validateConfig("featured_products", {
        source: "manual",
        product_ids: [],
      });
      expect(out).toEqual({ error: "Pick at least one product." });
    });

    it("keeps product_ids and nulls category_id for a valid manual config", () => {
      const out = validateConfig("featured_products", {
        heading: "Hand picks",
        source: "manual",
        product_ids: ["p1", "p2", 3, "p3"], // non-string filtered out
        category_id: "cat-should-be-dropped",
        limit: 4,
      });
      const config = (out as { config: FeaturedProductsConfig }).config;
      expect(config.source).toBe("manual");
      expect(config.product_ids).toEqual(["p1", "p2", "p3"]);
      expect(config.category_id).toBe(null);
    });

    it("errors when source=category has no category_id", () => {
      const out = validateConfig("featured_products", {
        source: "category",
        category_id: "   ",
      });
      expect(out).toEqual({ error: "Choose a category." });
    });

    it("keeps category_id and empties product_ids for a valid category config", () => {
      const out = validateConfig("featured_products", {
        source: "category",
        category_id: "  cat-42  ",
        product_ids: ["should", "be", "dropped"],
      });
      const config = (out as { config: FeaturedProductsConfig }).config;
      expect(config.source).toBe("category");
      expect(config.category_id).toBe("cat-42");
      expect(config.product_ids).toEqual([]);
    });

    it("clamps the limit", () => {
      const out = validateConfig("featured_products", {
        source: "featured",
        limit: 999,
      });
      const config = (out as { config: FeaturedProductsConfig }).config;
      expect(config.limit).toBe(LIMIT_MAX);
    });

    it("falls back to the default limit when limit is non-numeric", () => {
      const out = validateConfig("featured_products", {
        source: "featured",
        limit: "abc",
      });
      const config = (out as { config: FeaturedProductsConfig }).config;
      // Number("abc") is NaN -> clampLimit -> default 8.
      expect(config.limit).toBe(8);
    });
  });

  // --- shop_by_category ----------------------------------------------------
  describe("shop_by_category", () => {
    it("defaults source to 'all' and layout to 'grid'", () => {
      const out = validateConfig("shop_by_category", {
        heading: "  Categories  ",
        category_ids: ["dropped"], // irrelevant for source=all
      });
      const config = (out as { config: ShopByCategoryConfig }).config;
      expect(config).toEqual({
        heading: "Categories",
        subheading: "",
        source: "all",
        category_ids: [],
        layout: "grid",
      });
    });

    it("errors when source=selected has no category_ids", () => {
      const out = validateConfig("shop_by_category", {
        source: "selected",
        category_ids: [],
      });
      expect(out).toEqual({ error: "Pick at least one category." });
    });

    it("keeps category_ids for a valid selected config", () => {
      const out = validateConfig("shop_by_category", {
        source: "selected",
        category_ids: ["c1", "c2"],
      });
      const config = (out as { config: ShopByCategoryConfig }).config;
      expect(config.source).toBe("selected");
      expect(config.category_ids).toEqual(["c1", "c2"]);
    });

    it("honours layout='scroll'", () => {
      const out = validateConfig("shop_by_category", {
        source: "all",
        layout: "scroll",
      });
      const config = (out as { config: ShopByCategoryConfig }).config;
      expect(config.layout).toBe("scroll");
    });
  });

  // --- latest_blogs --------------------------------------------------------
  describe("latest_blogs", () => {
    it("defaults source to 'latest' and drops blog_ids", () => {
      const out = validateConfig("latest_blogs", {
        heading: "  Journal  ",
        blog_ids: ["dropped"],
        limit: 5,
      });
      const config = (out as { config: LatestBlogsConfig }).config;
      expect(config).toEqual({
        heading: "Journal",
        subheading: "",
        source: "latest",
        blog_ids: [],
        limit: 5,
        layout: "grid",
      });
    });

    it("errors when source=manual has no blog_ids", () => {
      const out = validateConfig("latest_blogs", {
        source: "manual",
        blog_ids: [],
      });
      expect(out).toEqual({ error: "Pick at least one blog post." });
    });

    it("keeps blog_ids for a valid manual config", () => {
      const out = validateConfig("latest_blogs", {
        source: "manual",
        blog_ids: ["b1", "b2"],
      });
      const config = (out as { config: LatestBlogsConfig }).config;
      expect(config.source).toBe("manual");
      expect(config.blog_ids).toEqual(["b1", "b2"]);
    });

    it("clamps the limit", () => {
      const out = validateConfig("latest_blogs", {
        source: "latest",
        limit: 0,
      });
      const config = (out as { config: LatestBlogsConfig }).config;
      expect(config.limit).toBe(LIMIT_MIN);
    });

    it("defaults layout to 'grid' and honours layout='scroll'", () => {
      const grid = (
        validateConfig("latest_blogs", { source: "latest" }) as {
          config: LatestBlogsConfig;
        }
      ).config;
      expect(grid.layout).toBe("grid");

      const scroll = (
        validateConfig("latest_blogs", {
          source: "manual",
          blog_ids: ["b1"],
          layout: "scroll",
        }) as { config: LatestBlogsConfig }
      ).config;
      expect(scroll.layout).toBe("scroll");
    });

    it("keeps source=featured and needs no blog_ids", () => {
      const out = validateConfig("latest_blogs", {
        source: "featured",
        limit: 4,
      });
      const config = (out as { config: LatestBlogsConfig }).config;
      expect(config.source).toBe("featured");
      expect(config.blog_ids).toEqual([]);
      expect(config.limit).toBe(4);
    });
  });

  // --- promo_banner --------------------------------------------------------
  describe("promo_banner", () => {
    it("errors when neither image_url nor heading is present", () => {
      const out = validateConfig("promo_banner", {
        subtext: "just some text",
      });
      expect(out).toEqual({
        error: "Add an image or a heading for the banner.",
      });
    });

    it("passes with only an image_url", () => {
      const out = validateConfig("promo_banner", {
        image_url: "https://cdn.example.com/banner.jpg",
      });
      expect("config" in out).toBe(true);
    });

    it("passes with only a heading", () => {
      const out = validateConfig("promo_banner", { heading: "Summer Sale" });
      expect("config" in out).toBe(true);
    });

    it("strips dangerous cta_href schemes to empty string", () => {
      for (const href of [
        "javascript:alert(1)",
        "  JavaScript:alert(1)",
        "data:text/html,<script>",
        "vbscript:msgbox(1)",
      ]) {
        const out = validateConfig("promo_banner", {
          heading: "Hi",
          cta_href: href,
        });
        const config = (out as { config: PromoBannerConfig }).config;
        expect(config.cta_href).toBe("");
      }
    });

    it("allows http(s) and relative cta_href", () => {
      const https = validateConfig("promo_banner", {
        heading: "Hi",
        cta_href: "https://example.com/sale",
      });
      expect((https as { config: PromoBannerConfig }).config.cta_href).toBe(
        "https://example.com/sale",
      );

      const relative = validateConfig("promo_banner", {
        heading: "Hi",
        cta_href: "/shop",
      });
      expect((relative as { config: PromoBannerConfig }).config.cta_href).toBe(
        "/shop",
      );
    });

    it("defaults alignment to 'left' and theme to 'light'", () => {
      const out = validateConfig("promo_banner", {
        heading: "Hi",
        alignment: "weird",
        theme: "rainbow",
      });
      const config = (out as { config: PromoBannerConfig }).config;
      expect(config.alignment).toBe("left");
      expect(config.theme).toBe("light");
    });

    it("honours center/right alignment and dark theme", () => {
      const center = validateConfig("promo_banner", {
        heading: "Hi",
        alignment: "center",
        theme: "dark",
      });
      const centerConfig = (center as { config: PromoBannerConfig }).config;
      expect(centerConfig.alignment).toBe("center");
      expect(centerConfig.theme).toBe("dark");

      const right = validateConfig("promo_banner", {
        heading: "Hi",
        alignment: "right",
      });
      expect((right as { config: PromoBannerConfig }).config.alignment).toBe(
        "right",
      );
    });

    it("trims text fields", () => {
      const out = validateConfig("promo_banner", {
        image_url: "  https://cdn.example.com/b.jpg  ",
        heading: "  Sale  ",
        subtext: "  Up to 50% off  ",
        cta_label: "  Shop now  ",
      });
      const config = (out as { config: PromoBannerConfig }).config;
      expect(config.image_url).toBe("https://cdn.example.com/b.jpg");
      expect(config.heading).toBe("Sale");
      expect(config.subtext).toBe("Up to 50% off");
      expect(config.cta_label).toBe("Shop now");
    });
  });
});

// summarizeSection() produces the one-line label shown on dashboard list rows.
describe("summarizeSection", () => {
  it("summarises featured_products in manual mode", () => {
    const config: FeaturedProductsConfig = {
      heading: "Editor's Picks",
      subheading: "",
      source: "manual",
      product_ids: ["a", "b", "c"],
      category_id: null,
      limit: 8,
    };
    expect(summarizeSection({ type: "featured_products", config })).toBe(
      "Editor's Picks · 3 hand-picked",
    );
  });

  it("summarises featured_products in category mode", () => {
    const config: FeaturedProductsConfig = {
      heading: "Soaps",
      subheading: "",
      source: "category",
      product_ids: [],
      category_id: "cat-1",
      limit: 8,
    };
    expect(summarizeSection({ type: "featured_products", config })).toBe(
      "Soaps · by category",
    );
  });

  it("summarises featured_products in featured (default) mode", () => {
    const config: FeaturedProductsConfig = {
      heading: "Bestsellers",
      subheading: "",
      source: "featured",
      product_ids: [],
      category_id: null,
      limit: 6,
    };
    expect(summarizeSection({ type: "featured_products", config })).toBe(
      "Bestsellers · featured · up to 6",
    );
  });

  it("falls back to the default featured label when heading is blank", () => {
    const config: FeaturedProductsConfig = {
      heading: "   ",
      subheading: "",
      source: "featured",
      product_ids: [],
      category_id: null,
      limit: 4,
    };
    expect(summarizeSection({ type: "featured_products", config })).toBe(
      "Featured products · featured · up to 4",
    );
  });

  it("summarises shop_by_category for all vs selected", () => {
    const all: ShopByCategoryConfig = {
      heading: "Categories",
      subheading: "",
      source: "all",
      category_ids: [],
      layout: "grid",
    };
    expect(summarizeSection({ type: "shop_by_category", config: all })).toBe(
      "Categories · all categories",
    );

    const selected: ShopByCategoryConfig = {
      heading: "",
      subheading: "",
      source: "selected",
      category_ids: ["c1", "c2"],
      layout: "scroll",
    };
    expect(
      summarizeSection({ type: "shop_by_category", config: selected }),
    ).toBe("Shop by category · 2 selected");
  });

  it("summarises promo_banner with and without a heading", () => {
    const withHeading: PromoBannerConfig = {
      image_url: "",
      heading: "Summer Sale",
      subtext: "",
      cta_label: "",
      cta_href: "",
      alignment: "left",
      theme: "light",
    };
    expect(
      summarizeSection({ type: "promo_banner", config: withHeading }),
    ).toBe("Promo · Summer Sale");

    const noHeading: PromoBannerConfig = {
      ...withHeading,
      heading: "   ",
    };
    expect(summarizeSection({ type: "promo_banner", config: noHeading })).toBe(
      "Promo · (no heading)",
    );
  });

  it("summarises latest_blogs for manual vs latest", () => {
    const manual: LatestBlogsConfig = {
      heading: "Journal",
      subheading: "",
      source: "manual",
      blog_ids: ["b1", "b2"],
      limit: 3,
      layout: "scroll",
    };
    expect(summarizeSection({ type: "latest_blogs", config: manual })).toBe(
      "Journal · 2 hand-picked",
    );

    const latest: LatestBlogsConfig = {
      heading: "",
      subheading: "",
      source: "latest",
      blog_ids: [],
      limit: 5,
      layout: "grid",
    };
    expect(summarizeSection({ type: "latest_blogs", config: latest })).toBe(
      "Blog posts · latest · up to 5",
    );

    const featured: LatestBlogsConfig = {
      heading: "",
      subheading: "",
      source: "featured",
      blog_ids: [],
      limit: 4,
      layout: "grid",
    };
    expect(summarizeSection({ type: "latest_blogs", config: featured })).toBe(
      "Blog posts · featured · up to 4",
    );
  });
});
