// ---------------------------------------------------------------------------
// Country catalog for the signup "where are you selling from?" step.
//
// Pure, client-safe (no imports) — the signup wizard is a client component.
// Codes are ISO 3166-1 alpha-2, matching react-phone-number-input's country
// codes so the phone-step default and this list stay aligned. Kept as a
// curated, India-first list rather than the full 240-country set — the signup
// dropdown wants the markets StoreMink actually serves near the top, not a wall
// of options. Add more as the platform expands.
// ---------------------------------------------------------------------------

export interface Country {
  /** ISO 3166-1 alpha-2 code (uppercase). */
  code: string;
  name: string;
}

export const DEFAULT_COUNTRY = "IN";

export const COUNTRIES: Country[] = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" },
  { code: "MY", name: "Malaysia" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
  { code: "PK", name: "Pakistan" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "JP", name: "Japan" },
  { code: "OTHER", name: "Other" },
];

const CODE_TO_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** Is `code` one of the countries we offer? */
export function isCountryCode(code: unknown): code is string {
  return typeof code === "string" && CODE_TO_NAME.has(code);
}

/** Human-readable name for a code (falls back to the code itself). */
export function countryName(code: string): string {
  return CODE_TO_NAME.get(code) ?? code;
}
