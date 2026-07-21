import Link from "next/link";
import {
  Package,
  LayoutTemplate,
  CreditCard,
  PenLine,
  BarChart3,
  Store,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { getViewerAccess, getViewerContext } from "./lib/access";
import { AskAnything } from "./ask-anything";

type SetupCard = {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  newTab?: boolean;
};

export default async function DashboardHomePage() {
  const [ctx, access] = [await getViewerContext(), await getViewerAccess()];
  const first = ctx?.profile?.first_name?.trim();
  const nameSuffix = first ? `, ${first}` : "";

  // Greeting in IST (the app is India-first). Server-rendered, so there's no
  // client hydration concern with the time-of-day word.
  const istHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const greeting =
    istHour < 12
      ? "Good morning"
      : istHour < 17
        ? "Good afternoon"
        : "Good evening";

  const can = (section: string) => access?.can(section, "view") ?? false;

  const cards: SetupCard[] = [
    can("products") && {
      icon: Package,
      title: "Add your products",
      desc: "Build your catalog so customers have something to buy.",
      href: "/dashboard/products",
    },
    can("builder") && {
      icon: LayoutTemplate,
      title: "Customize your storefront",
      desc: "Edit your homepage, pages, and branding in the builder.",
      href: "/dashboard/builder",
    },
    can("channels") && {
      icon: CreditCard,
      title: "Set up online payments",
      desc: "Connect Razorpay to accept cards & UPI (COD works out of the box).",
      href: "/dashboard/channels",
    },
    can("blogs") && {
      icon: PenLine,
      title: "Write a blog post",
      desc: "Share updates and improve your store's SEO.",
      href: "/dashboard/blogs",
    },
    can("analytics") && {
      icon: BarChart3,
      title: "Track performance",
      desc: "Revenue, orders, and customer trends over time.",
      href: "/dashboard/analytics",
    },
    {
      icon: Store,
      title: "View your live store",
      desc: "See what your customers see and share the link.",
      href: "/",
      newTab: true,
    },
  ].filter((c): c is SetupCard => Boolean(c));

  return (
    <div className="dash-page-enter mx-auto flex w-full max-w-3xl flex-col gap-6 py-1">
      <h1 className="text-[22px] font-bold tracking-tight text-[var(--dash-text)]">
        {greeting}
        {nameSuffix}. Let&apos;s get started.
      </h1>

      <AskAnything />

      {cards.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--dash-text-3)]">
            Set up your store
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  target={c.newTab ? "_blank" : undefined}
                  className="group flex items-start gap-3 rounded-[var(--dash-radius)] border border-[var(--dash-border)] bg-[var(--dash-surface)] p-4 shadow-[var(--dash-shadow-xs)] transition-colors hover:border-[var(--dash-accent)]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--dash-surface-2)] text-[var(--dash-text-2)] transition-colors group-hover:bg-[var(--dash-accent-soft)] group-hover:text-[var(--dash-accent)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--dash-text)]">
                      {c.title}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-snug text-[var(--dash-text-3)]">
                      {c.desc}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-1 flex items-center gap-3 text-[var(--dash-text-3)]">
        <div className="h-px flex-1 bg-[var(--dash-border)]" />
        <span className="inline-flex items-center gap-1.5 text-[13px]">
          <CheckCircle2 className="h-4 w-4 text-[var(--dash-green)]" />
          All caught up
        </span>
        <div className="h-px flex-1 bg-[var(--dash-border)]" />
      </div>
    </div>
  );
}
