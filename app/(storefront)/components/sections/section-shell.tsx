import type { SectionStyle } from "@/lib/homepage/section-types";

// The shared ROOT element of every rendered section. It REPLACES each section
// component's own `<section className="home-section …">` (never wraps it — an
// extra div would break the structural CSS: `.home-sections` flex gaps,
// `.home-section:has(.home-banner)` and `.home-sections > .home-custom-code:
// first-child`). Responsibilities:
//   • data-section-id — the builder overlay's hook + stable anchor handle.
//     Emitted always (a UUID already present in the page JSON, ~50 bytes);
//     the overlay itself only mounts in preview mode.
//   • shared per-section style (background / padding_y / width / anchor id),
//     validated by validateSectionStyle — background is a strict color, safe
//     for an inline style attribute.
// Absent `style` renders exactly the classes sections had before this shell.
export function SectionShell({
  sectionId,
  style,
  className,
  children,
}: {
  sectionId: string;
  style?: SectionStyle;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = [
    "home-section",
    className,
    style?.padding_y && style.padding_y !== "none"
      ? `home-pad-${style.padding_y}`
      : null,
    style?.width === "full" ? "is-fullbleed" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      id={style?.anchor || undefined}
      data-section-id={sectionId}
      className={cls}
      style={style?.background ? { background: style.background } : undefined}
    >
      {children}
    </section>
  );
}
