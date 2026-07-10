import Link from "next/link";

// Root 404. Reached when the (storefront) layout can't resolve the request Host
// to a real store (unclaimed subdomain / unknown custom domain) — it renders in
// the neutral root layout, with no store chrome, so it can't leak another
// store's branding. (In-store page/product misses render the storefront
// not-found instead — see app/(storefront)/not-found.tsx.)
export const metadata = {
  title: "Store not found",
  robots: { index: false, follow: false },
};

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "storemink.com";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#f6f7f9",
        color: "#0d1117",
      }}
    >
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: "-0.02em",
            marginBottom: 20,
          }}
        >
          Store<span style={{ color: "#4f39f6" }}>Mink</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 10px" }}>
          This store doesn&apos;t exist
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: "#5b6675",
            margin: "0 0 28px",
          }}
        >
          There&apos;s no store at this address. It may have been removed, or
          the link might be mistyped.
        </p>
        <a
          href={`https://${ROOT_DOMAIN}`}
          style={{
            display: "inline-block",
            background: "#4f39f6",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            padding: "12px 22px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Go to {ROOT_DOMAIN}
        </a>
        <p style={{ marginTop: 18, fontSize: 14, color: "#8b93a3" }}>
          Want your own store?{" "}
          <Link href="/signup" style={{ color: "#4f39f6", fontWeight: 600 }}>
            Create one free
          </Link>
        </p>
      </div>
    </main>
  );
}
