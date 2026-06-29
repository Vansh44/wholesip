const TOPICS = [
  {
    title: "Getting started",
    body: "Create your store, pick your address, and understand the dashboard.",
  },
  {
    title: "Setting up your store",
    body: "Branding, homepage sections, pages, and your store's look and feel.",
  },
  {
    title: "Products & inventory",
    body: "Add products, variants, images, pricing, and track stock.",
  },
  {
    title: "Payments — UPI, COD & GST",
    body: "Connect your payment gateway, enable COD, and set up GST invoicing.",
  },
  {
    title: "Domains",
    body: "Use your free your-store.storiq.in address or connect your own domain.",
  },
  {
    title: "Orders & shipping",
    body: "Manage orders, fulfilment, and Indian logistics integrations.",
  },
];

export default function HelpCentre() {
  return (
    <>
      <nav className="stq-nav">
        <a href="https://storiq.in" className="stq-logo">
          Stor<span>iq</span>
        </a>
        <div className="stq-nav-actions">
          <a href="https://storiq.in/signup" className="stq-btn stq-btn-primary">
            Create your store
          </a>
        </div>
      </nav>

      <header className="stq-hero">
        <span className="stq-kicker">Help Centre</span>
        <h1>How can we help?</h1>
        <p>
          Guides and answers for setting up and growing your D2C store on
          Storiq. Stuck somewhere? Start with a topic below.
        </p>
      </header>

      <section className="stq-section">
        <div className="stq-grid">
          {TOPICS.map((t) => (
            <div className="stq-card" key={t.title}>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="stq-footer">
        <p>
          Can&apos;t find what you need? Email{" "}
          <a href="mailto:support@storiq.in">support@storiq.in</a>.
        </p>
      </footer>
    </>
  );
}
