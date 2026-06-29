import Link from "next/link";

const FEATURES = [
  {
    title: "Your own storefront",
    body: "A fast, modern online store at your-name.storiq.in — or your own domain. Products, inventory, orders, analytics.",
  },
  {
    title: "Built for India",
    body: "Native UPI, COD and GST invoicing, Indian logistics, and WhatsApp commerce — the way your customers actually buy.",
  },
  {
    title: "Marketing that grows you",
    body: "Coupons, email campaigns, abandoned-cart recovery, customer segments and SEO tools — built in, not bolted on.",
  },
  {
    title: "You own everything",
    body: "Your customers, your brand, your data, your growth. Build assets you truly control — not a marketplace listing.",
  },
  {
    title: "D2C and B2B",
    body: "Sell to shoppers and to businesses from one place — tiered pricing, quotes and enquiries, staff access and roles.",
  },
  {
    title: "Launch in minutes",
    body: "No agencies, no developers, no enterprise budgets. Pick a name, set up your store, and start selling the same day.",
  },
];

export default function StoriqLanding() {
  return (
    <>
      <nav className="stq-nav">
        <Link href="/" className="stq-logo">
          Stor<span>iq</span>
        </Link>
        <div className="stq-nav-actions">
          <Link href="/login" className="stq-btn stq-btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="stq-btn stq-btn-primary">
            Start free
          </Link>
        </div>
      </nav>

      <header className="stq-hero">
        <span className="stq-kicker">Built for India 🇮🇳</span>
        <h1>From local business to digital brand.</h1>
        <p>
          Storiq is the simplest way for Indian businesses to launch, grow, and
          scale online. Enable anyone to create, manage, and grow a modern D2C
          brand — in minutes, without technical expertise, agencies, or
          enterprise budgets.
        </p>
        <div className="stq-hero-cta">
          <Link href="/signup" className="stq-btn stq-btn-primary">
            Create your store
          </Link>
          <Link href="/login" className="stq-btn stq-btn-ghost">
            Log in to your store
          </Link>
        </div>
      </header>

      <section className="stq-section">
        <div className="stq-grid">
          {FEATURES.map((f) => (
            <div className="stq-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="stq-footer">
        <p>
          Launch faster. Sell smarter. Own your customers. Grow independently.
          <br />
          Stuck? Visit the{" "}
          <a href="https://help.storiq.in">Storiq Help Centre</a>. ·{" "}
          <Link href="/login">Log in</Link> ·{" "}
          <Link href="/signup">Sign up</Link>
        </p>
      </footer>
    </>
  );
}
