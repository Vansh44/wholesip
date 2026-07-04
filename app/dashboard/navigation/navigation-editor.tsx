"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveStoreMenus } from "@/app/actions/menu-actions";
import type { FooterGroup, MenuLink, StoreMenus } from "@/lib/menus";

const inputClass =
  "border-input bg-background focus:border-primary placeholder:text-muted-foreground w-full rounded-md border px-2.5 py-1.5 text-sm outline-none";
const labelClass =
  "text-muted-foreground mb-1.5 block text-xs font-medium uppercase tracking-wide";

// Editor for one label→href list (header, a footer column, or the legal row).
function LinkListEditor({
  links,
  onChange,
  disabled,
  addLabel = "Add link",
}: {
  links: MenuLink[];
  onChange: (next: MenuLink[]) => void;
  disabled: boolean;
  addLabel?: string;
}) {
  const set = (i: number, patch: Partial<MenuLink>) =>
    onChange(links.map((l, j) => (i === j ? { ...l, ...patch } : l)));
  const remove = (i: number) => onChange(links.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= links.length) return;
    const next = [...links];
    [next[i], next[t]] = [next[t], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {links.map((link, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col">
            <button
              type="button"
              className="text-muted-foreground/50 hover:text-foreground disabled:opacity-30"
              onClick={() => move(i, -1)}
              disabled={disabled || i === 0}
              title="Move up"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            className={inputClass}
            value={link.label}
            onChange={(e) => set(i, { label: e.target.value })}
            placeholder="Label (e.g. Our Story)"
            disabled={disabled}
          />
          <input
            className={inputClass}
            value={link.href}
            onChange={(e) => set(i, { href: e.target.value })}
            placeholder="/our-story"
            disabled={disabled}
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-30"
            onClick={() => remove(i)}
            disabled={disabled}
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...links, { label: "", href: "" }])}
          disabled={disabled}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export function NavigationEditor({
  initial,
  canManage,
}: {
  initial: StoreMenus;
  canManage: boolean;
}) {
  const [header, setHeader] = useState<MenuLink[]>(initial.header);
  const [footerGroups, setFooterGroups] = useState<FooterGroup[]>(
    initial.footerGroups,
  );
  const [footerLegal, setFooterLegal] = useState<MenuLink[]>(
    initial.footerLegal,
  );
  const [isPending, startTransition] = useTransition();

  const setGroup = (i: number, patch: Partial<FooterGroup>) =>
    setFooterGroups((gs) =>
      gs.map((g, j) => (i === j ? { ...g, ...patch } : g)),
    );
  const removeGroup = (i: number) =>
    setFooterGroups((gs) => gs.filter((_, j) => j !== i));

  const save = () => {
    if (!canManage) return;
    startTransition(async () => {
      const res = await saveStoreMenus({ header, footerGroups, footerLegal });
      if (res.error) toast.error(res.error);
      else toast.success("Navigation saved");
    });
  };

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Navigation</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The links in your storefront header and footer. Use internal paths
            like <code>/shop</code> or <code>/our-story</code>, or full URLs.
          </p>
        </div>
        <Button onClick={save} disabled={!canManage || isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Header */}
      <section className="dash-card mb-5 p-5">
        <h2 className="mb-1 text-sm font-semibold">Header menu</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          The top navigation bar (also shown in the mobile menu).
        </p>
        <LinkListEditor
          links={header}
          onChange={setHeader}
          disabled={!canManage}
        />
      </section>

      {/* Footer columns */}
      <section className="dash-card mb-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Footer columns</h2>
            <p className="text-muted-foreground text-xs">
              Titled link groups shown in the footer.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFooterGroups((gs) => [...gs, { title: "", links: [] }])
            }
            disabled={!canManage}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add column
          </Button>
        </div>
        <div className="flex flex-col gap-6">
          {footerGroups.map((group, gi) => (
            <div key={gi} className="border-input rounded-lg border p-4">
              <div className="mb-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className={labelClass}>Column title</label>
                  <input
                    className={inputClass}
                    value={group.title}
                    onChange={(e) => setGroup(gi, { title: e.target.value })}
                    placeholder="e.g. Company"
                    disabled={!canManage}
                  />
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive mb-1.5 shrink-0 disabled:opacity-30"
                  onClick={() => removeGroup(gi)}
                  disabled={!canManage}
                  title="Remove column"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <LinkListEditor
                links={group.links}
                onChange={(links) => setGroup(gi, { links })}
                disabled={!canManage}
              />
            </div>
          ))}
          {footerGroups.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No footer columns. Add one to get started.
            </p>
          )}
        </div>
      </section>

      {/* Legal row */}
      <section className="dash-card mb-5 p-5">
        <h2 className="mb-1 text-sm font-semibold">Footer legal row</h2>
        <p className="text-muted-foreground mb-4 text-xs">
          The small print row at the very bottom (Privacy, Terms, …).
        </p>
        <LinkListEditor
          links={footerLegal}
          onChange={setFooterLegal}
          disabled={!canManage}
          addLabel="Add legal link"
        />
      </section>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!canManage || isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
