import Link from "next/link";
import Image from "next/image";
import type { HeroConfig, SectionStyle } from "@/lib/homepage/section-types";
import { SectionShell } from "./section-shell";

// First-class hero block. Three variants:
//   banner  — inset rounded card on a solid colour field, copy left / image
//             right (grocery-market style);
//   split   — half copy / half image band;
//   minimal — centred statement; an image (if any) becomes a full cover
//             background behind the copy.
// `config.background` is validated as a strict colour (safeColor), so it is
// safe in an inline style attribute — same contract as SectionStyle.background.
export function HeroSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: HeroConfig;
}) {
  if (!config.heading && !config.image_url) return null;

  const hasCta = config.cta_label && config.cta_href;
  const isExternal = /^https?:\/\//i.test(config.cta_href);
  const cta = hasCta ? (
    isExternal ? (
      <a
        className="home-hero-cta"
        href={config.cta_href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {config.cta_label}
      </a>
    ) : (
      <Link className="home-hero-cta" href={config.cta_href}>
        {config.cta_label}
      </Link>
    )
  ) : null;

  const asBackground = config.variant === "minimal" && !!config.image_url;
  const media = config.image_url ? (
    <Image
      src={config.image_url}
      alt={config.heading || "Hero"}
      fill
      priority
      sizes={asBackground ? "100vw" : "(max-width: 860px) 100vw, 50vw"}
      className="home-hero-img"
    />
  ) : null;

  return (
    <SectionShell sectionId={sectionId} style={style}>
      <div
        className={`home-hero variant-${config.variant} theme-${config.theme} align-${config.alignment}`}
        style={
          config.background ? { background: config.background } : undefined
        }
      >
        {asBackground && <div className="home-hero-bgmedia">{media}</div>}
        <div className="home-hero-copy">
          {config.badge_text && (
            <span className="home-hero-badge">{config.badge_text}</span>
          )}
          <h1 className="home-hero-heading">{config.heading}</h1>
          {config.subheading && (
            <p className="home-hero-sub">{config.subheading}</p>
          )}
          {cta}
        </div>
        {!asBackground && media && (
          <div className="home-hero-media">{media}</div>
        )}
      </div>
    </SectionShell>
  );
}
