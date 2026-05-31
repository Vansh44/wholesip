// "use client";

// import React, { useState } from "react";
// import Image from "next/image";

// export default function Home() {
//   const [email, setEmail] = useState("");

//   return (
//     <main style={styles.main}>
//       <div style={styles.container}>
//         {/* Adjusted Logo styling */}
//         <Image
//           src="/logo.png"
//           alt="Soakd Logo"
//           width={160} // Made wider to accommodate the wordmark
//           height={50}
//           style={styles.logo}
//         />

//         {/* Removed the H1 to avoid redundancy with the logo */}
//         <p style={styles.subtitle}>Healthy • Refreshing • Authentic</p>

//         <div style={styles.card}>
//           <h2 style={styles.cardTitle}>Launching Soon 🚀</h2>
//           <p style={styles.cardText}>Get Soakd, in real ingredients</p>

//           {/* Email Input */}
//           <div style={styles.inputWrapper}>
//             <input
//               type="email"
//               placeholder="Enter your email"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               style={styles.input}
//             />
//             <button style={styles.button}>Notify Me</button>
//           </div>
//         </div>

//         <p style={styles.footer}>Built with ❤️ by the Soakd Team</p>
//       </div>
//     </main>
//   );
// }

// const styles = {
//   main: {
//     height: "100vh",
//     background: "linear-gradient(to right, #0f172a, #1e293b)",
//     display: "flex",
//     justifyContent: "center",
//     alignItems: "center",
//     color: "white",
//     fontFamily: "system-ui, -apple-system, sans-serif",
//   },
//   container: {
//     textAlign: "center" as const,
//     maxWidth: "500px",
//     width: "100%",
//     padding: "20px",
//   },
//   logo: {
//     marginBottom: "20px",
//     // CSS trick to invert black text to white and blend the background away
//     filter: "invert(1) grayscale(100%) contrast(200%)",
//     mixBlendMode: "screen" as const,
//   },
//   subtitle: {
//     fontSize: "18px",
//     color: "#cbd5f5",
//     marginBottom: "30px",
//   },
//   card: {
//     background: "#1e293b",
//     padding: "30px",
//     borderRadius: "16px",
//     marginBottom: "20px",
//     boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
//   },
//   cardTitle: {
//     margin: "0 0 10px 0",
//   },
//   cardText: {
//     margin: "0 0 20px 0",
//     color: "#94a3b8",
//   },
//   inputWrapper: {
//     display: "flex",
//     gap: "10px",
//   },
//   input: {
//     flex: 1,
//     padding: "12px 16px",
//     borderRadius: "8px",
//     border: "1px solid #334155",
//     background: "#0f172a", // Darker input background
//     color: "white",
//     outline: "none",
//   },
//   button: {
//     padding: "12px 20px",
//     background: "#22c55e",
//     border: "none",
//     borderRadius: "8px",
//     color: "white",
//     fontWeight: "bold",
//     cursor: "pointer",
//   },
//   footer: {
//     fontSize: "13px",
//     color: "#64748b",
//     marginTop: "20px",
//   },
// };

import Hero from "./components/hero/Hero";

export default function Home() {
  return (
    <main>
      <Hero />
    </main>
  );
}
