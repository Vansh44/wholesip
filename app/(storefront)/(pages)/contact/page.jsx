export const metadata = {
  title: "Contact Us",
};

export default function Contact() {
  return (
    <main
      style={{
        padding: "140px 64px 80px",
        minHeight: "100vh",
        background: "var(--wholesip-cream)",
      }}
    >
      <h1 style={{ fontSize: "3rem", marginBottom: "20px" }}>Contact Us</h1>
      <p style={{ fontSize: "1.2rem", maxWidth: "600px", lineHeight: "1.6" }}>
        Got a question, a suggestion, or just want to say hi? Reach out and
        we&apos;ll get back to you soon.
      </p>
    </main>
  );
}
