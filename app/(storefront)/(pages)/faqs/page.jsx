export const metadata = {
  title: "FAQs",
};

export default function Faqs() {
  return (
    <main
      style={{
        padding: "140px 64px 80px",
        minHeight: "100vh",
        background: "var(--soakd-cream)",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>FAQs</h1>
      <p style={{ fontSize: "1.2rem", maxWidth: "600px", lineHeight: "1.6" }}>
        Questions about orders, ingredients, or shipping? Find quick answers to
        the things people ask us most.
      </p>
    </main>
  );
}
