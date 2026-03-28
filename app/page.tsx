'use client';

import React, { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState("");

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>Soakd 🌿</h1>

        <p style={styles.subtitle}>
          Healthy • Refreshing • Authentic
        </p>

        <div style={styles.card}>
          <h2>Launching Soon 🚀</h2>
          <p>Get Soakd, in real ingredients</p>

          {/* Email Input */}
          <div style={styles.inputWrapper}>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
            />
            <button style={styles.button}>
              Notify Me
            </button>
          </div>
        </div>

        <p style={styles.footer}>
          Built with ❤️ by the Soakd Team
        </p>
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
    maxWidth: "500px",
    width: "100%",
  },
  title: {
    fontSize: "52px",
    marginBottom: "10px",
    fontWeight: "bold",
  },
  subtitle: {
    fontSize: "18px",
    color: "#cbd5f5",
    marginBottom: "30px",
  },
  card: {
    background: "#1e293b",
    padding: "25px",
    borderRadius: "16px",
    marginBottom: "20px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
  },
  inputWrapper: {
    display: "flex",
    marginTop: "15px",
    gap: "10px",
  },
  input: {
    flex: 1,
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    outline: "none",
  },
  button: {
    padding: "12px 16px",
    background: "#22c55e",
    border: "none",
    borderRadius: "8px",
    color: "white",
    fontSize: "14px",
    cursor: "pointer",
  },
  footer: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "10px",
  },
};