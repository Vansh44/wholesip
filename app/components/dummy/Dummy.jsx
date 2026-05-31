"use client";

import { useState } from "react";
import styles from "./Dummy.module.css";

export default function ComingSoon() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, you would send this to your API or newsletter service (like Mailchimp/Klaviyo)
    alert(`Thanks for subscribing! We'll update ${email} soon.`);
    setEmail("");
  };

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.logo}>soakd.</h1>
        <h2 className={styles.headline}>Something fresh is soaking.</h2>
        <p className={styles.subhead}>
          We are crafting 100% real, stone-ground goodness with zero
          preservatives. Drop your email below to be the first to know when we
          launch.
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="email"
            placeholder="Enter your email address"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.button}>
            Notify Me
          </button>
        </form>
      </div>
    </main>
  );
}
