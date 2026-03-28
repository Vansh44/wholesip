export default function Home() {
  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>GetSoak 🌿</h1>
        <p style={styles.subtitle}>
          Healthy • Refreshing • Authentic Punjabi Drink
        </p>

        <div style={styles.card}>
          <h2>Launching Soon 🚀</h2>
          <p>Made with almonds, fennel, rose & natural ingredients.</p>
        </div>

        <button style={styles.button}>Notify Me</button>
      </div>
    </main>
  );
}

const styles = {
  main: {
    height: "100vh",
    background: "linear-gradient(to right, #0f172a, #1e293b)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    fontFamily: "Arial",
  },
  container: {
    textAlign: "center",
  },
  title: {
    fontSize: "48px",
    marginBottom: "10px",
  },
  subtitle: {
    fontSize: "18px",
    color: "#cbd5f5",
    marginBottom: "30px",
  },
  card: {
    background: "#1e293b",
    padding: "20px",
    borderRadius: "12px",
    marginBottom: "20px",
  },
  button: {
    padding: "12px 20px",
    background: "#22c55e",
    border: "none",
    borderRadius: "8px",
    color: "white",
    fontSize: "16px",
    cursor: "pointer",
  },
};