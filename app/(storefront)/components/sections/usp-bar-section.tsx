import {
  Star,
  BadgeCheck,
  Truck,
  ShieldCheck,
  Leaf,
  Gift,
  Lock,
  RefreshCcw,
  Clock,
  Heart,
  Headphones,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type {
  SectionStyle,
  UspBarConfig,
  UspIcon,
} from "@/lib/homepage/section-types";
import { SectionShell } from "./section-shell";

// Icon names are a fixed catalog (USP_ICONS, enforced by validateConfig) so
// this map is exhaustive and merchants can never inject markup.
const ICONS: Record<UspIcon, LucideIcon> = {
  star: Star,
  "badge-check": BadgeCheck,
  truck: Truck,
  shield: ShieldCheck,
  leaf: Leaf,
  gift: Gift,
  lock: Lock,
  refresh: RefreshCcw,
  clock: Clock,
  heart: Heart,
  headphones: Headphones,
  sparkles: Sparkles,
};

// Icon + label promise strip. theme = TEXT colour ("dark" ink on light
// backgrounds, "light" on dark ones — pair with the section Style background).
export function UspBarSection({
  sectionId,
  style,
  config,
}: {
  sectionId: string;
  style?: SectionStyle;
  config: UspBarConfig;
}) {
  if (config.items.length === 0) return null;

  return (
    <SectionShell sectionId={sectionId} style={style}>
      <div className={`home-usp theme-${config.theme}`}>
        {config.items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Star;
          return (
            <div className="home-usp-item" key={i}>
              <Icon className="home-usp-icon" aria-hidden="true" />
              <div className="home-usp-text">
                {item.title && (
                  <span className="home-usp-title">{item.title}</span>
                )}
                {item.subtitle && (
                  <span className="home-usp-sub">{item.subtitle}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SectionShell>
  );
}
