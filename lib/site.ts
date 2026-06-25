// Canonical public site origin (no trailing slash) and brand constants, shared
// by the sitemap, robots, and structured-data so they all agree on one URL.
// Prefers the configured app URL, then Vercel's deploy URL, then the production
// domain as a safe default.
function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  const raw = fromEnv
    ? fromEnv.startsWith("http")
      ? fromEnv
      : `https://${fromEnv}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://wholesip.com";
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();

export const BRAND_NAME = "WholeSip";

// Spelling variants Google might otherwise split into two separate words.
// Surfaced as schema.org `alternateName` so the brand reads as a proper noun.
export const BRAND_ALTERNATE_NAMES = ["wholesip", "whole sip", "Whole Sip"];
