import Link from "next/link";

// In-store 404 — the store exists but this page/product/blog doesn't. Renders
// INSIDE the storefront layout (Header/Footer + the store's branding). Distinct
// from the root not-found, which is for an unknown STORE (unresolved host).
export const metadata = { title: "Page not found" };

export default function StorefrontNotFound() {
  return (
    <main
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 10px" }}>
        Page not found
      </h1>
      <p
        style={{
          fontSize: 16,
          color: "var(--sm-ink-soft, #5b6675)",
          margin: "0 0 24px",
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="blog-publish-cta-btn"
        style={{
          display: "inline-block",
          padding: "12px 22px",
          borderRadius: 10,
          background: "var(--sm-ink, #17130f)",
          color: "#fff",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Back to home
      </Link>
    </main>
  );
}
