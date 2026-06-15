export const metadata = {
  title: "Our Story",
};

export default function OurStory() {
  return (
    <main
      style={{
        padding: "140px 64px 80px",
        minHeight: "100vh",
        background: "var(--soakd-cream)",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>Our Story</h1>
      <p style={{ fontSize: "1.2rem", maxWidth: "600px", lineHeight: "1.6" }}>
        Every jar of soakd. begins with a simple belief: real food, made slow,
        tastes better and does more. This is how we started, and where
        we&apos;re headed.
      </p>
    </main>
  );
}
