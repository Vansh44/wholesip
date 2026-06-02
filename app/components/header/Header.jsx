"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./Header.module.css";
import Image from "next/image";
import { siteConfig } from "@/config/site";
import { useAuth } from "@/app/components/auth/AuthProvider";

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const { user, customer, loading, openAuthModal, signOut } = useAuth();

  const isLoggedIn = !!user && !!customer;

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

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProfileOpen]);

  const handleProfileClick = () => {
    if (loading) return;
    if (isLoggedIn) {
      setIsProfileOpen((prev) => !prev);
    } else {
      openAuthModal();
    }
  };

  const handleSignOut = async () => {
    setIsProfileOpen(false);
    await signOut();
  };

  const displayName = customer
    ? `${customer.first_name}${customer.last_name ? " " + customer.last_name : ""}`
    : user?.phone || "Account";

  const initials = customer?.first_name
    ? customer.first_name.charAt(0).toUpperCase()
    : "?";

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <Link href="/" className={styles.logo}>
          <Image
            src={siteConfig.assets.logoUrl}
            alt="Soakd Logo"
            width={180}
            height={60}
            priority
            style={{ height: "auto" }}
          />
        </Link>

        <nav className={styles.navLinks}>
          <Link href="/pages/shop">Shop</Link>
          <Link href="/pages/track-order">Track Order</Link>
          <Link href="/pages/find-us">Find Us</Link>
          <Link href="/pages/enquiries">Enquiries</Link>
          <Link href="/pages/blogs">Blogs</Link>
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

        {/* Profile Button with Dropdown */}
        <div className={styles.profileWrapper} ref={profileRef}>
          <button
            className={`${styles.userIcon} ${isLoggedIn ? styles.userIconLoggedIn : ""}`}
            onClick={handleProfileClick}
            aria-label={isLoggedIn ? "Open profile menu" : "Sign in"}
            id="header-profile-btn"
          >
            {isLoggedIn ? (
              <span className={styles.avatarBubble}>{initials}</span>
            ) : (
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
            )}
          </button>

          {/* Profile Dropdown */}
          {isProfileOpen && isLoggedIn && (
            <div className={styles.profileDropdown} id="profile-dropdown">
              <div className={styles.profileDropdownHeader}>
                <span className={styles.profileDropdownAvatar}>{initials}</span>
                <div className={styles.profileDropdownInfo}>
                  <span className={styles.profileDropdownName}>
                    {displayName}
                  </span>
                  {user?.phone && (
                    <span className={styles.profileDropdownPhone}>
                      {user.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.profileDropdownDivider} />
              <button
                className={styles.profileDropdownItem}
                onClick={handleSignOut}
                id="profile-logout-btn"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log out
              </button>
            </div>
          )}
        </div>

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

        {/* Mobile auth section in drawer */}
        <div className={styles.drawerAuth}>
          {isLoggedIn ? (
            <>
              <div className={styles.drawerAuthUser}>
                <span className={styles.drawerAuthAvatar}>{initials}</span>
                <span className={styles.drawerAuthName}>{displayName}</span>
              </div>
              <button
                className={styles.drawerAuthBtn}
                onClick={() => {
                  setIsMenuOpen(false);
                  handleSignOut();
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <button
              className={styles.drawerAuthBtn}
              onClick={() => {
                setIsMenuOpen(false);
                openAuthModal();
              }}
            >
              Sign in
            </button>
          )}
        </div>
      </div>

      {/* Drawer Overlay Backdrop */}
      <div
        className={`${styles.drawerOverlay} ${isMenuOpen ? styles.overlayVisible : ""}`}
        onClick={() => setIsMenuOpen(false)}
      />
    </header>
  );
}
