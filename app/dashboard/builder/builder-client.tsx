/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import { toast } from "sonner";
import { arrayMove } from "@dnd-kit/sortable";
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
  deletePage,
  getPageDraft,
  publishPage,
  unpublishPage,
  updatePageMeta,
  type PageDraft,
  type PageListItem,
} from "@/app/actions/page-actions";
import { useAutosave, type SaveStatus } from "./use-autosave";
import {
  EMPTY_CONFIG,
  HOMEPAGE_SECTION_TYPES,
  SECTION_TYPE_META,
  type AnySectionConfig,
  type HomepageSectionType,
  type SectionStyle,
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
import { OutlinePanel } from "./outline-panel";
import { InspectorPanel } from "./inspector-panel";

type Options = {
  products: ProductOption[];
  categories: CategoryOption[];
  blogs: BlogOption[];
};

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
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
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  // Sections the preview reported as not rendering (empty/no data).
  const [hiddenSectionIds, setHiddenSectionIds] = useState<Set<string>>(
    new Set(),
  );
  // Canvas hover → outline highlight sync.
  const [canvasHoverId, setCanvasHoverId] = useState<string | null>(null);
  // Where the next added section goes: undefined = append (outline button),
  // null = top of page, string = after that section (canvas "+ add" buttons).
  const insertAfterRef = useRef<string | null | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Dialogs.
  const [typeChooserOpen, setTypeChooserOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [deletePageOpen, setDeletePageOpen] = useState(false);

  const options: Options = { products, categories, blogs };

  // Autosave plumbing: the hook reads the LATEST sections + stale-tab token
  // from refs so a completing save never races a render. The ref is the
  // synchronous source of truth (written in setDraftSynced, never during
  // render); `draft` state mirrors it for rendering.
  const draftRef = useRef<PageDraft | null>(null);
  const tokenRef = useRef<string>("");

  const setDraftSynced = useCallback(
    (updater: (d: PageDraft | null) => PageDraft | null) => {
      draftRef.current = updater(draftRef.current);
      setDraft(draftRef.current);
    },
    [],
  );

  // Preview refresh, coalesced: at most one ping per 1200ms, always trailing —
  // continuous edits produce zero refreshes, a pause produces exactly one.
  const lastPingRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pingPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win)
      win.postMessage({ type: "sm-preview-refresh" }, window.location.origin);
  }, []);

  const pingPreviewCoalesced = useCallback(() => {
    const since = Date.now() - lastPingRef.current;
    if (pingTimerRef.current) return; // trailing ping already scheduled
    const fire = () => {
      pingTimerRef.current = null;
      lastPingRef.current = Date.now();
      pingPreview();
    };
    if (since >= 1200) fire();
    else pingTimerRef.current = setTimeout(fire, 1200 - since);
  }, [pingPreview]);

  const { status, markDirty, flush } = useAutosave({
    pageId: draft?.id ?? null,
    getSections: () => draftRef.current?.sections ?? [],
    tokenRef,
    onSaved: pingPreviewCoalesced,
  });

  const postToPreview = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  // Canvas → builder messages (BuilderOverlay inside the preview iframe).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as {
        type?: string;
        id?: string | null;
        afterId?: string | null;
        ids?: string[];
      };
      switch (data?.type) {
        case "sm-select":
          if (typeof data.id === "string") setSelectedSectionId(data.id);
          break;
        case "sm-hover":
          setCanvasHoverId(data.id ?? null);
          break;
        case "sm-add-at":
          insertAfterRef.current = data.afterId ?? null;
          setTypeChooserOpen(true);
          break;
        case "sm-visible": {
          // Enabled sections the page did NOT render (empty → no DOM node).
          const visible = new Set(data.ids ?? []);
          const hidden = new Set(
            (draftRef.current?.sections ?? [])
              .filter((s) => s.enabled && !visible.has(s.id))
              .map((s) => s.id),
          );
          setHiddenSectionIds(hidden);
          break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const loadDraft = useCallback(
    async (id: string) => {
      setLoadingDraft(true);
      const d = await getPageDraft(id);
      setLoadingDraft(false);
      if (!d) {
        toast.error("Could not open that page.");
        return;
      }
      tokenRef.current = d.updated_at;
      setDraftSynced(() => d);
      setSelectedId(id);
      setSelectedSectionId(null);
      setPreviewNonce((n) => n + 1);
    },
    [setDraftSynced],
  );

  const hasAutoSelected = useRef(false);
  useEffect(() => {
    if (!hasAutoSelected.current && initialPages.length > 0) {
      hasAutoSelected.current = true;
      loadDraft(initialPages[0].id);
    }
  }, [initialPages, loadDraft]);

  // --- Local section mutations (autosaved) ---
  const setSections = useCallback(
    (
      updater: (s: PageSectionItem[]) => PageSectionItem[],
      kind: "content" | "structural" = "structural",
    ) => {
      setDraftSynced((d) => (d ? { ...d, sections: updater(d.sections) } : d));
      markDirty(kind);
    },
    [setDraftSynced, markDirty],
  );

  const selectedSection =
    draft?.sections.find((s) => s.id === selectedSectionId) ?? null;

  const updateSelectedConfig = (config: AnySectionConfig) => {
    if (!selectedSectionId) return;
    setSections(
      (s) =>
        s.map((it) => (it.id === selectedSectionId ? { ...it, config } : it)),
      "content",
    );
  };

  const updateSelectedStyle = (style: SectionStyle) => {
    if (!selectedSectionId) return;
    setSections(
      (s) =>
        s.map((it) => (it.id === selectedSectionId ? { ...it, style } : it)),
      "content",
    );
  };

  const toggleSection = (id: string) =>
    setSections((s) =>
      s.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it)),
    );

  const duplicateSection = () => {
    const src = selectedSection;
    if (!src) return;
    const copy: PageSectionItem = structuredClone(src);
    copy.id = crypto.randomUUID();
    if (copy.style?.anchor) delete copy.style.anchor; // anchors must stay unique
    setSections((s) => {
      const i = s.findIndex((it) => it.id === src.id);
      const next = [...s];
      next.splice(i + 1, 0, copy);
      return next;
    });
    setSelectedSectionId(copy.id);
  };

  const deleteSection = () => {
    if (!selectedSectionId) return;
    setSections((s) => s.filter((it) => it.id !== selectedSectionId));
    setSelectedSectionId(null);
  };

  const reorderSections = (activeId: string, overId: string) =>
    setSections((s) => {
      const from = s.findIndex((it) => it.id === activeId);
      const to = s.findIndex((it) => it.id === overId);
      if (from < 0 || to < 0) return s;
      return arrayMove(s, from, to);
    });

  const addSection = (type: HomepageSectionType) => {
    const item: PageSectionItem = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      config: structuredClone(EMPTY_CONFIG[type]) as AnySectionConfig,
    };
    const insertAfter = insertAfterRef.current;
    insertAfterRef.current = undefined;
    setTypeChooserOpen(false);
    setSections((s) => {
      if (insertAfter === undefined) return [...s, item]; // append (outline)
      if (insertAfter === null) return [item, ...s]; // top of page
      const i = s.findIndex((it) => it.id === insertAfter);
      const next = [...s];
      next.splice(i < 0 ? s.length : i + 1, 0, item);
      return next;
    });
    setSelectedSectionId(item.id);
    if (type === "custom_code") setCodeEditorOpen(true);
  };

  // --- Page-level actions ---
  const handlePublish = () => {
    if (!draft) return;
    startTransition(async () => {
      const flushed = await flush();
      if (!flushed) {
        toast.error("Couldn't save your latest changes — publish aborted.");
        return;
      }
      const result = await publishPage(draft.id, tokenRef.current);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Page published");
      const nextToken = result.data?.updated_at;
      if (typeof nextToken === "string") tokenRef.current = nextToken;
      const publishedAt =
        (result.data?.published_at as string) ?? new Date().toISOString();
      setDraftSynced((d) =>
        d
          ? {
              ...d,
              status: "published",
              updated_at: tokenRef.current,
              published_at: publishedAt,
            }
          : d,
      );
      setPages((ps) =>
        ps.map((p) =>
          p.id === draft.id
            ? { ...p, status: "published", published_at: publishedAt }
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
      // Unpublish stamps updated_at — re-pull so the stale-tab token stays valid.
      const fresh = await getPageDraft(draft.id);
      if (fresh) {
        tokenRef.current = fresh.updated_at;
        setDraftSynced(() => fresh);
      }
    });
  };

  const handleSavePageMeta = async (fields: {
    title: string;
    slug: string;
    seo_title: string;
    seo_description: string;
    seo_noindex: boolean;
  }): Promise<boolean> => {
    if (!draft) return false;
    const result = await updatePageMeta(draft.id, fields);
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    // updatePageMeta stamps updated_at — re-pull to refresh the token, the
    // (possibly renamed) slug for the preview URL, and the pages list row.
    const fresh = await getPageDraft(draft.id);
    if (fresh) {
      tokenRef.current = fresh.updated_at;
      setDraftSynced(() => fresh);
      setPages((ps) =>
        ps.map((p) =>
          p.id === draft.id
            ? { ...p, title: fresh.title, slug: fresh.slug }
            : p,
        ),
      );
      setPreviewNonce((n) => n + 1);
    }
    return true;
  };

  const handleDeletePage = () => {
    if (!draft) return;
    startTransition(async () => {
      const result = await deletePage(draft.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Page deleted");
      setDeletePageOpen(false);
      setPages((ps) => ps.filter((p) => p.id !== draft.id));
      setDraftSynced(() => null);
      setSelectedId(null);
      setSelectedSectionId(null);
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
            {draft
              ? draft.slug === ""
                ? "Home"
                : draft.title || draft.slug
              : "Website Builder"}
          </span>
        </div>

        <div className="sm-builder-viewports">
          <ViewportButton
            active={viewport === "desktop"}
            onClick={() => setViewport("desktop")}
            icon={<Monitor className="h-4 w-4" />}
            label="Desktop"
          />
          <ViewportButton
            active={viewport === "tablet"}
            onClick={() => setViewport("tablet")}
            icon={<Tablet className="h-4 w-4" />}
            label="Tablet"
          />
          <ViewportButton
            active={viewport === "mobile"}
            onClick={() => setViewport("mobile")}
            icon={<Smartphone className="h-4 w-4" />}
            label="Mobile"
          />
        </div>

        {draft && (
          <div className="sm-builder-topbar-right">
            <SaveStatusIndicator status={status} onRetry={() => flush()} />
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
        <OutlinePanel
          pages={pages}
          selectedPageId={selectedId}
          onSelectPage={loadDraft}
          onNewPage={() => setNewPageOpen(true)}
          sections={draft?.sections ?? null}
          selectedSectionId={selectedSectionId}
          canvasHoverId={canvasHoverId}
          hiddenSectionIds={hiddenSectionIds}
          onSelectSection={(id) => {
            setSelectedSectionId(id);
            postToPreview({ type: "sm-scroll-to", id });
          }}
          onHoverSection={(id) => postToPreview({ type: "sm-highlight", id })}
          onToggleSection={toggleSection}
          onReorder={reorderSections}
          onAddSection={() => {
            insertAfterRef.current = undefined;
            setTypeChooserOpen(true);
          }}
        />

        {/* Center: preview */}
        <main className="sm-builder-preview">
          {loadingDraft ? (
            <div className="sm-builder-preview-empty">
              <Loader2 className="h-6 w-6 animate-spin opacity-50" />
            </div>
          ) : draft ? (
            <div
              className="sm-builder-frame-wrap"
              style={{ width: VIEWPORT_WIDTH[viewport] }}
            >
              <iframe
                key={`${draft.id}-${previewNonce}`}
                ref={iframeRef}
                src={`/${draft.slug}?preview=1`}
                className="sm-builder-frame"
                title="Page preview"
              />
            </div>
          ) : (
            <div className="sm-builder-preview-empty">
              <FileText className="h-8 w-8 opacity-30" />
              <p>Select a page to start editing, or create a new one.</p>
            </div>
          )}
        </main>

        <InspectorPanel
          draft={draft}
          section={selectedSection}
          options={options}
          onConfigChange={updateSelectedConfig}
          onStyleChange={updateSelectedStyle}
          onDuplicate={duplicateSection}
          onDelete={deleteSection}
          onClearSelection={() => setSelectedSectionId(null)}
          onOpenCodeEditor={() => setCodeEditorOpen(true)}
          onSavePageMeta={handleSavePageMeta}
          onDeletePage={() => setDeletePageOpen(true)}
        />
      </div>

      {/* Type chooser */}
      <Dialog
        open={typeChooserOpen}
        onOpenChange={(o) => {
          setTypeChooserOpen(o);
          if (!o) insertAfterRef.current = undefined;
        }}
      >
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

      {/* Code editor (custom_code) — the wide surface the inspector can't be.
          Writes through to the draft live; autosave picks it up. */}
      <Dialog open={codeEditorOpen} onOpenChange={setCodeEditorOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[920px]">
          <DialogHeader>
            <DialogTitle>Custom code</DialogTitle>
            <DialogDescription>
              Runs in a secure sandbox on your page. Changes save automatically.
            </DialogDescription>
          </DialogHeader>
          {selectedSection?.type === "custom_code" && (
            <div className="space-y-5 py-2">
              <SectionForm
                type="custom_code"
                config={selectedSection.config}
                setConfig={updateSelectedConfig}
                products={products}
                categories={categories}
                blogs={blogs}
              />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCodeEditorOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete page confirm */}
      <Dialog open={deletePageOpen} onOpenChange={setDeletePageOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete this page?</DialogTitle>
            <DialogDescription>
              “{draft?.title || draft?.slug}” and its sections will be deleted
              permanently. Visitors will get a 404 at /{draft?.slug}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletePageOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeletePage}
              disabled={isPending}
              className="bg-[var(--dash-red,#d33a45)] hover:bg-[#b32e38]"
            >
              Delete page
            </Button>
          </DialogFooter>
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

      {/* Controlled open with no onOpenChange: not dismissible by Esc/outside
          click — the only way forward is the reload button. */}
      <Dialog open={status === "blocked"}>
        <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>This page changed somewhere else</DialogTitle>
            <DialogDescription>
              It was edited from another tab or by a teammate. Reload the
              builder to continue from the latest version — your unsaved changes
              here can&apos;t be applied safely.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => window.location.reload()}>
              Reload builder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewportButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      className={`sm-builder-viewport ${active ? "active" : ""}`}
      onClick={onClick}
      title={label}
    >
      {icon}
    </button>
  );
}

function SaveStatusIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <button className="sm-builder-savestate is-error" onClick={onRetry}>
        Couldn&apos;t save — retry
      </button>
    );
  }
  const label =
    status === "saving" || status === "dirty"
      ? "Saving…"
      : status === "blocked"
        ? "Paused"
        : "Saved";
  return (
    <span
      className={`sm-builder-savestate ${status === "saved" ? "is-saved" : ""}`}
    >
      {status === "saving" || status === "dirty" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : null}
      {label}
    </span>
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
