/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Home,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/slug";
import { navIcons } from "../sidebar-nav-link";
import {
  createPage,
  getPageDraft,
  publishPage,
  savePageDraft,
  unpublishPage,
  type PageDraft,
  type PageListItem,
} from "@/app/actions/page-actions";
import {
  EMPTY_CONFIG,
  HOMEPAGE_SECTION_TYPES,
  SECTION_TYPE_META,
  summarizeSection,
  type AnySectionConfig,
  type HomepageSectionType,
} from "@/lib/homepage/section-types";
import type { PageSectionItem } from "@/lib/sections/registry";
import {
  SectionForm,
  fieldClass,
  labelClass,
  type BlogOption,
  type CategoryOption,
  type ProductOption,
} from "./section-form";

type Options = {
  products: ProductOption[];
  categories: CategoryOption[];
  blogs: BlogOption[];
};

export function BuilderClient({
  initialPages,
  products,
  categories,
  blogs,
  storeName,
}: Options & {
  initialPages: PageListItem[];
  storeName: string;
}) {
  const [pages, setPages] = useState(initialPages);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PageDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [isPending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Section editor + new-page + type-chooser dialogs.
  const [editing, setEditing] = useState<{
    index: number;
    item: PageSectionItem;
  } | null>(null);
  const [typeChooserOpen, setTypeChooserOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);

  const options: Options = { products, categories, blogs };

  const loadDraft = useCallback(async (id: string) => {
    setLoadingDraft(true);
    const d = await getPageDraft(id);
    setLoadingDraft(false);
    if (!d) {
      toast.error("Could not open that page.");
      return;
    }
    setDraft(d);
    setSelectedId(id);
    setPreviewNonce((n) => n + 1);
  }, []);

  // --- Local section mutations (persisted only on Save draft) ---
  const setSections = (
    updater: (s: PageSectionItem[]) => PageSectionItem[],
  ) => {
    setDraft((d) => (d ? { ...d, sections: updater(d.sections) } : d));
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    setSections((s) => {
      const target = index + dir;
      if (target < 0 || target >= s.length) return s;
      const next = [...s];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleSection = (index: number) =>
    setSections((s) =>
      s.map((it, i) => (i === index ? { ...it, enabled: !it.enabled } : it)),
    );

  const removeSection = (index: number) =>
    setSections((s) => s.filter((_, i) => i !== index));

  const addSection = (type: HomepageSectionType) => {
    const item: PageSectionItem = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      config: structuredClone(EMPTY_CONFIG[type]) as AnySectionConfig,
    };
    setTypeChooserOpen(false);
    // Open the editor straight away for the new section.
    setDraft((d) => (d ? { ...d, sections: [...d.sections, item] } : d));
    setEditing({ index: draft?.sections.length ?? 0, item });
  };

  const applyEditedSection = (config: AnySectionConfig) => {
    if (!editing) return;
    setSections((s) =>
      s.map((it, i) => (i === editing.index ? { ...it, config } : it)),
    );
    setEditing(null);
  };

  // --- Preview refresh: ping the iframe; it router.refresh()es itself. ---
  const pingPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win)
      win.postMessage({ type: "sm-preview-refresh" }, window.location.origin);
  }, []);

  const handleSaveDraft = () => {
    if (!draft) return;
    startTransition(async () => {
      const result = await savePageDraft(
        draft.id,
        draft.sections,
        draft.updated_at,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved");
      // Re-pull the draft to get the new updated_at (stale-tab token) and
      // refresh the preview to the saved state.
      const fresh = await getPageDraft(draft.id);
      if (fresh) setDraft(fresh);
      pingPreview();
    });
  };

  const handlePublish = () => {
    if (!draft) return;
    startTransition(async () => {
      // Publish saves the current draft first so nothing is lost.
      const saved = await savePageDraft(
        draft.id,
        draft.sections,
        draft.updated_at,
      );
      if (saved.error) {
        toast.error(saved.error);
        return;
      }
      const result = await publishPage(draft.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Page published");
      const fresh = await getPageDraft(draft.id);
      if (fresh) setDraft(fresh);
      setPages((ps) =>
        ps.map((p) =>
          p.id === draft.id
            ? {
                ...p,
                status: "published",
                published_at: new Date().toISOString(),
              }
            : p,
        ),
      );
      pingPreview();
    });
  };

  const handleUnpublish = () => {
    if (!draft) return;
    startTransition(async () => {
      const result = await unpublishPage(draft.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Page unpublished");
      setPages((ps) =>
        ps.map((p) => (p.id === draft.id ? { ...p, status: "draft" } : p)),
      );
      const fresh = await getPageDraft(draft.id);
      if (fresh) setDraft(fresh);
    });
  };

  return (
    <div className="sm-builder">
      {/* Top bar */}
      <header className="sm-builder-topbar">
        <div className="sm-builder-topbar-left">
          <Link
            href="/dashboard"
            className="sm-builder-back"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="sm-builder-brand">{storeName}</span>
          <span className="sm-builder-sep">/</span>
          <span className="sm-builder-title">
            Website Builder
            {draft && (
              <>
                {" "}
                <span className="sm-builder-sep">/</span>{" "}
                {draft.title || draft.slug}
              </>
            )}
          </span>
        </div>
        {draft && (
          <div className="sm-builder-topbar-right">
            <span
              className={`sm-builder-status ${draft.status === "published" ? "is-live" : ""}`}
            >
              {draft.status === "published" ? "Live" : "Draft"}
            </span>
            <Link
              href={`/${draft.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="sm-builder-iconbtn"
              title="Open live page"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save draft"}
            </Button>
            {draft.status === "published" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnpublish}
                disabled={isPending}
              >
                Unpublish
              </Button>
            ) : null}
            <Button size="sm" onClick={handlePublish} disabled={isPending}>
              Publish
            </Button>
          </div>
        )}
      </header>

      <div className="sm-builder-body">
        {/* Left: pages */}
        <aside className="sm-builder-pages">
          <div className="sm-builder-panel-head">
            <span>Pages</span>
            <button
              className="sm-builder-addpage"
              onClick={() => setNewPageOpen(true)}
              title="New page"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="sm-builder-pagelist">
            {/* Homepage sentinel (slug "") is always pinned first. */}
            {[...pages]
              .sort((a, b) => (a.slug === "" ? -1 : b.slug === "" ? 1 : 0))
              .map((p) => {
                const isHome = p.slug === "";
                return (
                  <button
                    key={p.id}
                    className={`sm-builder-pageitem ${selectedId === p.id ? "active" : ""}`}
                    onClick={() => loadDraft(p.id)}
                  >
                    {isHome ? (
                      <Home className="h-4 w-4 shrink-0 opacity-60" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 opacity-60" />
                    )}
                    <span className="sm-builder-pageitem-main">
                      <span className="sm-builder-pageitem-title">
                        {isHome ? "Home" : p.title || p.slug}
                      </span>
                      <span className="sm-builder-pageitem-slug">
                        {isHome ? "Homepage" : `/${p.slug}`}
                      </span>
                    </span>
                    <span
                      className={`sm-builder-dot ${p.status === "published" ? "is-live" : ""}`}
                      title={p.status}
                    />
                  </button>
                );
              })}
          </div>
        </aside>

        {/* Center: preview */}
        <main className="sm-builder-preview">
          {loadingDraft ? (
            <div className="sm-builder-preview-empty">
              <Loader2 className="h-6 w-6 animate-spin opacity-50" />
            </div>
          ) : draft ? (
            <iframe
              key={`${draft.id}-${previewNonce}`}
              ref={iframeRef}
              src={`/${draft.slug}?preview=1`}
              className="sm-builder-frame"
              title="Page preview"
            />
          ) : (
            <div className="sm-builder-preview-empty">
              <FileText className="h-8 w-8 opacity-30" />
              <p>Select a page to start editing, or create a new one.</p>
            </div>
          )}
        </main>

        {/* Right: sections */}
        <aside className="sm-builder-sections">
          <div className="sm-builder-panel-head">
            <span>Sections</span>
            {draft && (
              <button
                className="sm-builder-addpage"
                onClick={() => setTypeChooserOpen(true)}
                title="Add section"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="sm-builder-sectionlist">
            {!draft && <p className="sm-builder-empty">No page selected.</p>}
            {draft && draft.sections.length === 0 && (
              <p className="sm-builder-empty">
                No sections yet. Click + to add one.
              </p>
            )}
            {draft?.sections.map((s, i) => {
              const meta = SECTION_TYPE_META[s.type];
              const Icon = navIcons[meta.icon as keyof typeof navIcons];
              return (
                <div
                  key={s.id}
                  className={`sm-builder-sectionitem ${s.enabled ? "" : "is-off"}`}
                >
                  <span className="sm-builder-sectionicon">
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                  </span>
                  <span className="sm-builder-sectionmain">
                    <span className="sm-builder-sectiontype">{meta.label}</span>
                    <span className="sm-builder-sectionsummary">
                      {summarizeSection(s)}
                    </span>
                  </span>
                  <span className="sm-builder-sectionactions">
                    <button
                      onClick={() => moveSection(i, -1)}
                      disabled={i === 0}
                      title="Up"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => moveSection(i, 1)}
                      disabled={i === draft.sections.length - 1}
                      title="Down"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleSection(i)}
                      title={s.enabled ? "Hide" : "Show"}
                    >
                      {s.enabled ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => setEditing({ index: i, item: s })}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeSection(i)}
                      title="Delete"
                      className="sm-builder-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
          {draft && (
            <p className="sm-builder-hint">
              Changes are local until you <strong>Save draft</strong>. The
              preview updates on save. <strong>Publish</strong> makes them live.
            </p>
          )}
        </aside>
      </div>

      {/* Section editor dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent
          className={`max-h-[92vh] overflow-y-auto ${
            editing?.item.type === "custom_code"
              ? "sm:max-w-[900px]"
              : "sm:max-w-[560px]"
          }`}
        >
          {editing && (
            <SectionEditorBody
              item={editing.item}
              options={options}
              onCancel={() => setEditing(null)}
              onApply={applyEditedSection}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Type chooser */}
      <Dialog open={typeChooserOpen} onOpenChange={setTypeChooserOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
              Pick a block to add to this page.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {HOMEPAGE_SECTION_TYPES.map((t) => {
              const meta = SECTION_TYPE_META[t];
              const Icon = navIcons[meta.icon as keyof typeof navIcons];
              return (
                <button
                  key={t}
                  className="sm-builder-typecard"
                  onClick={() => addSection(t)}
                >
                  <span className="sm-builder-typeicon">
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                  </span>
                  <span className="sm-builder-typelabel">{meta.label}</span>
                  <span className="sm-builder-typedesc">
                    {meta.description}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* New page */}
      <NewPageDialog
        open={newPageOpen}
        onClose={() => setNewPageOpen(false)}
        onCreated={(id, item) => {
          setPages((ps) => [item, ...ps]);
          setNewPageOpen(false);
          loadDraft(id);
        }}
      />
    </div>
  );
}

// Section editor body — local config state, applied to the draft on save.
function SectionEditorBody({
  item,
  options,
  onCancel,
  onApply,
}: {
  item: PageSectionItem;
  options: Options;
  onCancel: () => void;
  onApply: (config: AnySectionConfig) => void;
}) {
  const [config, setConfig] = useState<AnySectionConfig>(() =>
    structuredClone(item.config),
  );
  const meta = SECTION_TYPE_META[item.type];
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit · {meta.label}</DialogTitle>
        <DialogDescription>{meta.description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 py-2">
        <SectionForm
          type={item.type}
          config={config}
          setConfig={setConfig}
          products={options.products}
          categories={options.categories}
          blogs={options.blogs}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onApply(config)}>Apply</Button>
      </DialogFooter>
    </>
  );
}

function NewPageDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string, item: PageListItem) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  // Once the user edits the slug by hand, stop auto-deriving it from the title.
  const slugEdited = useRef(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setTitle("");
      setSlug("");
      slugEdited.current = false;
    }
  }, [open]);

  const submit = () => {
    startTransition(async () => {
      const result = await createPage(slug, title);
      if (result.error || !result.data?.id) {
        toast.error(result.error ?? "Could not create the page.");
        return;
      }
      const id = result.data.id as string;
      const cleanSlug = slug.trim().toLowerCase();
      onCreated(id, {
        id,
        slug: cleanSlug,
        title: title.trim() || cleanSlug,
        status: "draft",
        updated_at: new Date().toISOString(),
        published_at: null,
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New page</DialogTitle>
          <DialogDescription>
            Give it a title and a URL slug. You can change these later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className={labelClass}>Title</label>
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => {
                const next = e.target.value;
                setTitle(next);
                if (!slugEdited.current) setSlug(slugify(next));
              }}
              placeholder="About Us"
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass}>URL slug</label>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">/</span>
              <input
                className={fieldClass}
                value={slug}
                onChange={(e) => {
                  slugEdited.current = true;
                  setSlug(e.target.value);
                }}
                placeholder="about-us"
              />
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Lowercase letters, numbers and hyphens.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !slug.trim()}>
            {isPending ? "Creating…" : "Create page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
