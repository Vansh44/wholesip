export const metadata = {
  title: "Shipping Info",
};

export default function Shipping() {
  return (
    <main
      style={{
        padding: "140px 64px 80px",
        minHeight: "100vh",
        background: "var(--wholesip-cream)",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>Shipping Info</h1>
      <p style={{ fontSize: "1.2rem", maxWidth: "600px", lineHeight: "1.6" }}>
        Where we ship, how long it takes, and what it costs. All the delivery
        details in one place.
      </p>
    </main>
  );
}
