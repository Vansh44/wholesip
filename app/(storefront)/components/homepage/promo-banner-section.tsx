import Link from "next/link";
import Image from "next/image";
import type { PromoBannerConfig } from "@/lib/homepage/section-types";

// Full-width promo banner. Internal CTA links use next/link; absolute URLs use
// a plain anchor. Renders nothing if there's neither an image nor a heading.
export function PromoBannerSection({ config }: { config: PromoBannerConfig }) {
  if (!config.image_url && !config.heading) return null;

  const hasCta = config.cta_label && config.cta_href;
  const isExternal = /^https?:\/\//i.test(config.cta_href);

  const cta = hasCta ? (
    isExternal ? (
      <a
        className="home-banner-cta"
        href={config.cta_href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {config.cta_label}
      </a>
    ) : (
      <Link className="home-banner-cta" href={config.cta_href}>
        {config.cta_label}
      </Link>
    )
  ) : null;

  return (
    <section className="home-section">
      <div
        className={`home-banner align-${config.alignment} theme-${config.theme}`}
      >
        {config.image_url && (
          <Image
            src={config.image_url}
            alt={config.heading || "Promotion"}
            fill
            sizes="100vw"
            className="home-banner-img"
          />
        )}
        <div className="home-banner-overlay">
          <div className="home-banner-content">
            {config.heading && (
              <h2 className="home-banner-heading">{config.heading}</h2>
            )}
            {config.subtext && (
              <p className="home-banner-subtext">{config.subtext}</p>
            )}
            {cta}
          </div>
        </div>
      </div>
    </section>
  );
}
