import type { SectionStyle, TickerConfig } from "@/lib/homepage/section-types";
import { SectionShell } from "./section-shell";

// Scrolling marquee strip. theme = TEXT colour ("dark" ink on light backgrounds,
// "light" on dark ones — pair with the section Style background for the band).
// Pure CSS animation (homepage.css): two identical sequences translate -50% for
// a seamless loop; pauses on hover; static + wrapped under prefers-reduced-motion.
export function TickerSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: TickerConfig;
}) {
  if (config.messages.length === 0) return null;

  // Repeat the messages enough to fill wide screens before the -50% loop point,
  // so short lists don't leave a visible gap (fewer messages → more repeats).
  const repeats = Math.min(
    12,
    Math.max(3, Math.ceil(12 / config.messages.length)),
  );
  const sequence = Array.from({ length: repeats }).flatMap(
    () => config.messages,
  );

  // A single filled sequence; the track holds two of these (the second aria-
  // hidden so screen readers announce the messages only once).
  const seq = (ariaHidden?: boolean) => (
    <div className="home-ticker-seq" aria-hidden={ariaHidden || undefined}>
      {sequence.map((message, i) => (
        <span className="home-ticker-item" key={i}>
          {message}
        </span>
      ))}
    </div>
  );

  return (
    <SectionShell sectionId={sectionId} style={style}>
      <div
        className={`home-ticker theme-${config.theme} speed-${config.speed}`}
      >
        <div className="home-ticker-track">
          {seq()}
          {seq(true)}
        </div>
      </div>
    </SectionShell>
  );
}
