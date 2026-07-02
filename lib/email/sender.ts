import type { StoreBrand } from "@/lib/store/brand";

// The platform's own Resend-verified sending domain. Verified ONCE, centrally,
// so every store can send deliverable mail through it without each merchant
// having to verify a domain first. Override per-environment with RESEND_FROM_DOMAIN.
export const PLATFORM_EMAIL_DOMAIN = (
  process.env.RESEND_FROM_DOMAIN || "storemink.com"
)
  .trim()
  .toLowerCase();

// The domain a given store actually sends email FROM. Resend rejects mail from
// any domain that isn't verified in the account, so we may only use a store's
// own custom domain once it's been verified (settings.resend_domain_verified,
// flipped by the custom-domain flow). Until then — and for every plain
// {slug}.storemink.com store, whose subdomain is NOT a verified Resend domain —
// we fall back to the shared platform domain so the mail still goes out.
export function senderDomainFor(store: {
  custom_domain: string | null;
  settings: Record<string, unknown> | null | undefined;
}): string {
  const verified = store.settings?.resend_domain_verified === true;
  return verified && store.custom_domain
    ? store.custom_domain.toLowerCase()
    : PLATFORM_EMAIL_DOMAIN;
}

// Build an RFC-5322-safe `Display Name <local@domain>` From header. `brand.domain`
// is always a verified sending domain (see getStoreBrand), so this is deliverable.
// The display name is sanitised for header safety — never HTML-escaped, which
// would garble names like "Ben & Jerry's" inside a mail header.
export function fromAddress(
  brand: StoreBrand,
  opts: { local?: string; suffix?: string } = {},
): string {
  const local = opts.local ?? "admin";
  const raw = opts.suffix ? `${brand.name} ${opts.suffix}` : brand.name;
  return `${displayName(raw)} <${local}@${brand.domain}>`;
}

function displayName(raw: string): string {
  const clean =
    raw
      .replace(/[\r\n"\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Store";
  // Quote when the name contains characters special to the header grammar.
  return /[(),.:;<>@[\]]/.test(clean) ? `"${clean}"` : clean;
}
