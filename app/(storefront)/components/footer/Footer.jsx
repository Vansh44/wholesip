"use client";

import Link from "next/link";
import styles from "./Footer.module.css";
import Image from "next/image";
import { siteConfig } from "@/config/site";
import { useRouter, usePathname } from "next/navigation";

const socialLinks = [
  {
    name: "Instagram",
    href: "https://instagram.com/getsoakd.official",
    icon: (
      <Image
        src={siteConfig.assets.instagramLogoUrl}
        alt="Instagram"
        width={24}
        height={24}
        style={{
          width: "24px",
          height: "24px",
          objectFit: "contain",
        }}
      />
    ),
  },
  {
    name: "YouTube",
    href: "https://youtube.com/@soakd",
    icon: (
      <Image
        src={siteConfig.assets.youtubeLogoUrl}
        alt="YouTube"
        width={24}
        height={24}
        style={{
          width: "24px",
          height: "24px",
          objectFit: "contain",
        }}
      />
    ),
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/919999999999",
    icon: (
      <Image
        src={siteConfig.assets.whatsappLogoUrl}
        alt="WhatsApp"
        width={24}
        height={24}
        style={{
          width: "24px",
          height: "24px",
          objectFit: "contain",
        }}
      />
    ),
  },
];

const certBadges = [
  { label: "100% Natural", icon: "🌿" },
  { label: "No Preservatives", icon: "✓" },
  { label: "Cold Pressed", icon: "❄" },
  { label: "Handcrafted", icon: "✦" },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogoClick = (e) => {
    e.preventDefault();

    if (pathname === "/") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } else {
      router.push("/");
    }
  };
  return (
    <footer className={styles.footer}>
      {/* Newsletter Bar */}
      <div className={styles.newsletterBar}>
        <div className={styles.newsletterInner}>
          <div className={styles.newsletterText}>
            <span className={styles.newsletterLabel}>Stay in the loop</span>
            <p className={styles.newsletterSub}>
              Recipes, restocks &amp; real food tips — straight to your inbox.
            </p>
          </div>
          <form
            className={styles.newsletterForm}
            onSubmit={(e) => e.preventDefault()}
          >
            <input
              type="email"
              placeholder="your@email.com"
              className={styles.newsletterInput}
              aria-label="Email address"
            />
            <button type="submit" className={styles.newsletterBtn}>
              Subscribe
            </button>
          </form>
        </div>
      </div>

      {/* Trust Badges */}
      <div className={styles.trustBar}>
        <div className={styles.trustInner}>
          {certBadges.map((b) => (
            <div key={b.label} className={styles.trustBadge}>
              <span className={styles.trustIcon}>{b.icon}</span>
              <span>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Brand Column */}
        <div className={styles.brandCol}>
          <Link href="/" className={styles.logo} onClick={handleLogoClick}>
            <Image
              src={siteConfig.assets.logoUrl}
              alt="Soakd Logo"
              width={160}
              height={60}
              priority
              style={{ height: "auto" }}
            />
          </Link>
          <p className={styles.tagline}>
            Real food for real people. Soaked, sprouted &amp; crafted with
            intention — so every bite works harder for you.
          </p>

          {/* Contact Info */}
          <div className={styles.contactBlock}>
            <a href="mailto:hello@soakd.in" className={styles.contactLine}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              hello@soakd.in
            </a>
            <a href="tel:+919999999999" className={styles.contactLine}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.13 6.13l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              +91 99999 99999
            </a>
            <span className={styles.contactLine}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Mon–Sat, 10am–6pm IST
            </span>
          </div>

          {/* Social Links */}
          <div className={styles.socials}>
            {socialLinks.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialIcon}
                aria-label={s.name}
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Shop Column */}
        <div className={styles.linkCol}>
          <h4 className={styles.columnTitle}>Shop</h4>
          <nav className={styles.linkList}>
            <Link href="/shop">All Products</Link>
            <Link href="/shop?category=butters">Nut Butters</Link>
            <Link href="/shop?category=milks">Nut Milks</Link>
            <Link href="/shop?category=snacks">Snacks</Link>
            <Link href="/shop?tag=bestseller">Bestsellers</Link>
            <Link href="/shop?tag=new">New Arrivals</Link>
            <Link href="/gift-packs">Gift Packs</Link>
          </nav>
        </div>

        {/* Company Column */}
        <div className={styles.linkCol}>
          <h4 className={styles.columnTitle}>Company</h4>
          <nav className={styles.linkList}>
            <Link href="/our-story">Our Story</Link>
            <Link href="/process">The Process</Link>
            <Link href="/ingredients">Our Ingredients</Link>
            <Link href="/sustainability">Sustainability</Link>
            <Link href="/blogs">Blog &amp; Recipes</Link>
            <Link href="/careers">Careers</Link>
          </nav>
        </div>

        {/* Support Column */}
        <div className={styles.linkCol}>
          <h4 className={styles.columnTitle}>Support</h4>
          <nav className={styles.linkList}>
            <Link href="/faqs">FAQs</Link>
            <Link href="/track-order">Track My Order</Link>
            <Link href="/returns">Returns &amp; Refunds</Link>
            <Link href="/shipping">Shipping Info</Link>
            <Link href="/enquiries">Bulk / Wholesale</Link>
            <Link href="/contact">Contact Us</Link>
          </nav>
        </div>
      </div>

      {/* Bottom Row */}
      <div className={styles.bottomSection}>
        {/* Legal Links + Copyright */}
        <div className={styles.legalRow}>
          <p className={styles.copyright}>
            &copy; {currentYear} Soakd Foods Pvt. Ltd. All rights reserved.
          </p>
          <div className={styles.legalLinks}>
            <Link href="/privacy-policy">Privacy Policy</Link>
            <span className={styles.legalDivider}>·</span>
            <Link href="/terms">Terms of Use</Link>
            <span className={styles.legalDivider}>·</span>
            <Link href="/refund-policy">Refund Policy</Link>
            <span className={styles.legalDivider}>·</span>
            <Link href="/cookie-policy">Cookie Policy</Link>
          </div>
        </div>
      </div>
      <div className={styles.credit}>
        <strong>Built with ❤️ by Soakd Team</strong>
      </div>
    </footer>
  );
}
