export const metadata = {
  title: "Our Ingredients",
};

export default function Ingredients() {
  return (
    <main
      style={{
        padding: "140px 64px 80px",
        minHeight: "100vh",
        background: "var(--wholesip-cream)",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>
        Our Ingredients
      </h1>
      <p style={{ fontSize: "1.2rem", maxWidth: "600px", lineHeight: "1.6" }}>
        Clean, traceable, and nothing you can&apos;t pronounce. Here&apos;s
        exactly what goes into wholesip. and where it comes from.
      </p>
    </main>
  );
}
