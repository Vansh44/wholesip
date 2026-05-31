"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./Header.module.css";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/" className={styles.logo}>
          soakd
        </Link>

        <nav className={styles.navLinks}>
          <Link href="/pages/shop">Shop</Link>
          <Link href="/pages/track-order">Track Order</Link>
          <Link href="/pages/find-us">Find Us</Link>
          <Link href="/pages/enquiries">Enquiries</Link>
          <Link href="/pages/our-story">Our Story</Link>
        </nav>
      </div>

      <div className={styles.headerRight}>
        {/* Search Bar - Now exclusively in the main header */}
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

        {/* Mobile Hamburger Button */}
        <button
          className={styles.hamburgerBtn}
          onClick={() => setIsMenuOpen(true)}
          aria-label="Open Menu"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      <div
        className={`${styles.mobileDrawer} ${isMenuOpen ? styles.drawerOpen : ""}`}
      >
        <div className={styles.drawerHeader}>
          <Link
            href="/"
            className={styles.logo}
            onClick={() => setIsMenuOpen(false)}
          >
            soakd
          </Link>
          <button
            className={styles.closeBtn}
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close Menu"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* The Search Bar has been removed from this drawer */}

        <nav className={styles.drawerNav}>
          <Link href="/pages/shop" onClick={() => setIsMenuOpen(false)}>
            Shop
          </Link>
          <Link href="/track-order" onClick={() => setIsMenuOpen(false)}>
            Track Order
          </Link>
          <Link href="/find-us" onClick={() => setIsMenuOpen(false)}>
            Find Us
          </Link>
          <Link href="/enquiries" onClick={() => setIsMenuOpen(false)}>
            Enquiries
          </Link>
          <Link href="/pages/our-story" onClick={() => setIsMenuOpen(false)}>
            Our Story
          </Link>
        </nav>
      </div>

      {/* Drawer Overlay Backdrop */}
      <div
        className={`${styles.drawerOverlay} ${isMenuOpen ? styles.overlayVisible : ""}`}
        onClick={() => setIsMenuOpen(false)}
      />
    </header>
  );
}
