import { describe, it, expect } from "vitest";
import { parseHost } from "./resolve";

// parseHost() is the pure core of tenant resolution: it maps a raw Host header
// to "which store (or the platform) does this request belong to". Default
// ROOT_DOMAIN is "storemink.com" (NEXT_PUBLIC_ROOT_DOMAIN unset in tests).
describe("parseHost", () => {
  // A subdomain of the root domain is a store, identified by its first label.
  it("maps a store subdomain to its slug", () => {
    expect(parseHost("acme.storemink.com")).toEqual({
      type: "store-subdomain",
      slug: "acme",
    });
  });

  // The port must be stripped and the host lowercased before classifying.
  it("strips port and lowercases", () => {
    expect(parseHost("ACME.storemink.com:3000")).toEqual({
      type: "store-subdomain",
      slug: "acme",
    });
  });

  // The apex, www, and the reserved platform host are NOT stores.
  it("treats apex / www / app as the platform", () => {
    expect(parseHost("storemink.com").type).toBe("platform");
    expect(parseHost("www.storemink.com").type).toBe("platform");
    expect(parseHost("app.storemink.com").type).toBe("platform");
  });

  // A merchant's own domain doesn't end in the root domain → custom domain,
  // resolved later by the stores.custom_domain lookup.
  it("treats an unrelated domain as a custom domain", () => {
    expect(parseHost("shop.acme.com")).toEqual({
      type: "custom-domain",
      domain: "shop.acme.com",
    });
  });

  // Local dev + Vercel previews render the platform (which falls back to
  // WholeSip), so day-to-day work is unchanged.
  it("treats localhost and vercel previews as the platform", () => {
    expect(parseHost("localhost").type).toBe("platform");
    expect(parseHost("localhost:3000").type).toBe("platform");
    expect(parseHost("127.0.0.1").type).toBe("platform");
    expect(parseHost("my-app-abc123.vercel.app").type).toBe("platform");
  });

  // `{slug}.localhost` is the escape hatch for testing multi-tenant routing
  // locally without DNS.
  it("supports {slug}.localhost for local multi-tenant testing", () => {
    expect(parseHost("acme.localhost:3000")).toEqual({
      type: "store-subdomain",
      slug: "acme",
    });
  });

  // Missing/blank Host must never throw — fall back to the platform.
  it("falls back to platform for empty/missing host", () => {
    expect(parseHost(null).type).toBe("platform");
    expect(parseHost(undefined).type).toBe("platform");
    expect(parseHost("").type).toBe("platform");
    expect(parseHost("   ").type).toBe("platform");
  });
});
