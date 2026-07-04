import "server-only";
import crypto from "node:crypto";

// Search-engine notification: tell crawlers about new/changed URLs so a store
// is discovered and re-indexed quickly, instead of waiting for organic crawl.
//
// Two independent, best-effort channels — each no-ops safely until its config
// is present, and NEITHER ever throws (a failure must never break the store
// action that triggered it). Callers fire these via `after()` so the user's
// response isn't blocked.
//
//   • IndexNow  → Bing, Yandex, Naver, Seznam (NOT Google). No account/setup
//                 beyond the public key file at /{key}.txt (public/). Active in
//                 production out of the box.
//   • Google    → Search Console `sitemaps.submit`. Dormant until the platform
//                 sets GOOGLE_SEARCH_CONSOLE_CREDENTIALS (service-account JSON)
//                 + GOOGLE_SEARCH_CONSOLE_PROPERTY (e.g. "sc-domain:storemink.com").

// Public IndexNow key. Served verbatim at public/<key>.txt so the search engine
// can confirm ownership. Overridable via env, but the file must match.
export const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY ?? "3b7d8ad31a67d0ae436d04d13a099b6c";

const TIMEOUT_MS = 3000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── IndexNow ───────────────────────────────────────────────────────────────

// The IndexNow POST body. All urlList entries must share one host, which is
// declared as `host` + `keyLocation`. Pure so it can be unit-tested.
export function indexNowPayload(host: string, urls: string[]) {
  return {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };
}

// Notify IndexNow that these URLs changed. Best-effort, bounded, never throws.
// Skipped outside production (dev/preview hosts aren't publicly reachable), so
// it doesn't ping with localhost URLs; set INDEXNOW_FORCE=1 to override.
export async function pingIndexNow(urls: string[]): Promise<void> {
  const https = urls.filter((u) => u.startsWith("https://"));
  if (!https.length) return;
  if (process.env.NODE_ENV !== "production" && !process.env.INDEXNOW_FORCE) {
    return;
  }
  // One request per host (IndexNow requires a single host per submission).
  const host = new URL(https[0]).host;
  const sameHost = https.filter((u) => new URL(u).host === host);
  try {
    await fetchWithTimeout("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(indexNowPayload(host, sameHost)),
    });
  } catch (err) {
    console.error("pingIndexNow failed:", (err as Error).message);
  }
}

// ── Google Search Console ────────────────────────────────────────────────────

interface GoogleCreds {
  client_email: string;
  private_key: string;
}

function loadGoogleCreds(): GoogleCreds | null {
  const raw = process.env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string"
    ) {
      return {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// The Search Console sitemaps.submit endpoint (PUT, empty body) for a sitemap
// under a verified property. Pure so it can be unit-tested.
export function googleSitemapEndpoint(
  property: string,
  sitemapUrl: string,
): string {
  return `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    property,
  )}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
}

// Mint an OAuth access token from a service-account key via the JWT-bearer
// grant (RS256), scoped to Search Console. Returns null on any failure.
async function googleAccessToken(creds: GoogleCreds): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/webmasters",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  // JSON in an env var may keep \n literally escaped — normalize to real ones.
  const key = creds.private_key.replace(/\\n/g, "\n");
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key, "base64url");

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

// Submit a store's sitemap to Google Search Console. Dormant (no-op) until the
// platform's service-account + property env are set. Best-effort, never throws.
export async function submitSitemapToGoogle(sitemapUrl: string): Promise<void> {
  const creds = loadGoogleCreds();
  const property = process.env.GOOGLE_SEARCH_CONSOLE_PROPERTY;
  if (!creds || !property) return;
  try {
    const token = await googleAccessToken(creds);
    if (!token) return;
    const res = await fetchWithTimeout(
      googleSitemapEndpoint(property, sitemapUrl),
      { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.error(
        "submitSitemapToGoogle:",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (err) {
    console.error("submitSitemapToGoogle failed:", (err as Error).message);
  }
}
