import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/" className={styles.logo}>
          soakd
        </Link>

        <nav className={styles.navLinks}>
          <Link href="/shop">Shop</Link>
          <Link href="/track-order">Track Order</Link>
          <Link href="/find-us">Find Us</Link>
          <Link href="/enquiries">Enquiries</Link>
          <Link href="/our-story">Our Story</Link>
        </nav>
      </div>

      <div className={styles.headerRight}>
        <div className={styles.searchBar}>
          <input
            type="text"
            placeholder="search..."
            className={styles.searchInput}
          />
          <span className={styles.searchIcon}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
        </div>
        <button className={styles.userIcon}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
      </div>
    </header>
  );
}
