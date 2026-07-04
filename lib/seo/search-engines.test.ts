import { describe, it, expect } from "vitest";
import {
  indexNowPayload,
  googleSitemapEndpoint,
  INDEXNOW_KEY,
} from "./search-engines";

describe("indexNowPayload", () => {
  it("declares host + keyLocation and carries the urlList", () => {
    const payload = indexNowPayload("acme.storemink.com", [
      "https://acme.storemink.com/shop/tomatoes",
    ]);
    expect(payload).toEqual({
      host: "acme.storemink.com",
      key: INDEXNOW_KEY,
      keyLocation: `https://acme.storemink.com/${INDEXNOW_KEY}.txt`,
      urlList: ["https://acme.storemink.com/shop/tomatoes"],
    });
  });
});

describe("googleSitemapEndpoint", () => {
  it("encodes the property and the sitemap URL into the submit path", () => {
    const endpoint = googleSitemapEndpoint(
      "sc-domain:storemink.com",
      "https://acme.storemink.com/sitemap.xml",
    );
    expect(endpoint).toBe(
      "https://www.googleapis.com/webmasters/v3/sites/" +
        encodeURIComponent("sc-domain:storemink.com") +
        "/sitemaps/" +
        encodeURIComponent("https://acme.storemink.com/sitemap.xml"),
    );
    // The `:` and `/` must be percent-encoded so they don't break the path.
    expect(endpoint).toContain("sc-domain%3Astoremink.com");
    expect(endpoint).toContain(
      "https%3A%2F%2Facme.storemink.com%2Fsitemap.xml",
    );
  });
});
