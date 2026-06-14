"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { navIcons } from "../sidebar-nav-link";
import {
  deleteSection,
  reorderSections,
  toggleSection,
} from "@/app/actions/homepage-actions";
import {
  HOMEPAGE_SECTION_TYPES,
  SECTION_TYPE_META,
  summarizeSection,
  type HomepageSection,
  type HomepageSectionType,
} from "@/lib/homepage/section-types";
import { SectionEditorDialog } from "./section-editor-dialog";
import type { CategoryOption, ProductOption } from "./page";

type Props = {
  sections: HomepageSection[];
  products: ProductOption[];
  categories: CategoryOption[];
  canManage?: boolean;
};

export function HomepageManagementView({
  sections,
  products,
  categories,
  canManage = true,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<HomepageSection | null>(
    null,
  );

  // Editor state. `createType` set => create mode for that type; otherwise
  // `editing` holds the row being edited.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HomepageSection | null>(null);
  const [createType, setCreateType] = useState<HomepageSectionType | null>(
    null,
  );
  const [typeChooserOpen, setTypeChooserOpen] = useState(false);

  // Local order mirrors the server list so up/down feels instant; the action
  // persists the new sort_order.
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  const openCreate = (type: HomepageSectionType) => {
    setTypeChooserOpen(false);
    setEditing(null);
    setCreateType(type);
    setEditorOpen(true);
  };

  const openEdit = (section: HomepageSection) => {
    setCreateType(null);
    setEditing(section);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setCreateType(null);
  };

  const handleSaved = () => {
    closeEditor();
    router.refresh();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteSection(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Section deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const handleToggle = (section: HomepageSection) => {
    startTransition(async () => {
      const result = await toggleSection(section.id, !section.enabled);
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const result = await reorderSections(next.map((s) => s.id));
      if (result.error) toast.error(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>🏠 Homepage</h1>
          <p>
            Build the storefront homepage below the hero — add, reorder and
            toggle sections.
          </p>
        </div>
        {canManage && (
          <button
            className="dash-btn dash-btn-primary shrink-0"
            onClick={() => setTypeChooserOpen(true)}
          >
            ＋ Add Section
          </button>
        )}
      </header>

      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Sections
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {ordered.length} {ordered.length === 1 ? "section" : "sections"}
            </span>
          </div>
        </div>

        {ordered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🧱</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              No sections yet
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              Add your first homepage section — it renders below the hero.
            </div>
            {canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => setTypeChooserOpen(true)}
              >
                ＋ Add Section
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                {canManage && <th style={{ width: 64 }}>Order</th>}
                <th>Section</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {ordered.map((s, i) => {
                const meta = SECTION_TYPE_META[s.type];
                const Icon = navIcons[meta.icon as keyof typeof navIcons];
                return (
                  <tr key={s.id}>
                    {canManage && (
                      <td>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => move(i, -1)}
                            disabled={i === 0 || isPending}
                            title="Move up"
                            className="flex h-7 w-6 items-center justify-center rounded-md text-[#8b93a8] hover:bg-[#252b3d] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === ordered.length - 1 || isPending}
                            title="Move down"
                            className="flex h-7 w-6 items-center justify-center rounded-md text-[#8b93a8] hover:bg-[#252b3d] disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-2.5">
                        {Icon && (
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                            style={{ background: "var(--dash-surface-2)" }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {meta.label}
                          </div>
                          <div
                            style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}
                          >
                            {summarizeSection(s)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={!canManage || isPending}
                        onClick={() => handleToggle(s)}
                        className={`dash-badge ${
                          s.enabled ? "dash-badge-green" : "dash-badge-grey"
                        }`}
                        style={{
                          cursor: canManage ? "pointer" : "default",
                          border: "none",
                        }}
                        title={
                          canManage
                            ? s.enabled
                              ? "Click to hide"
                              : "Click to show"
                            : undefined
                        }
                      >
                        {s.enabled ? "Visible" : "Hidden"}
                      </button>
                    </td>
                    {canManage && (
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                            Actions
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[160px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => openEdit(s)}
                            >
                              ✏️ Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                            <DropdownMenuItem
                              className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                              onClick={() => setDeleteTarget(s)}
                            >
                              🗑 Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Type chooser */}
      <Dialog
        open={typeChooserOpen}
        onOpenChange={(open) => !open && setTypeChooserOpen(false)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Add a section</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Pick a block type. You can edit its content next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            {HOMEPAGE_SECTION_TYPES.map((type) => {
              const meta = SECTION_TYPE_META[type];
              const Icon = navIcons[meta.icon as keyof typeof navIcons];
              return (
                <button
                  key={type}
                  onClick={() => openCreate(type)}
                  className="flex w-full items-start gap-3 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0e1118] p-3 text-left hover:border-[#6366f1]"
                >
                  {Icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#1a1f2e]">
                      <Icon className="h-4 w-4" />
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <div className="text-xs text-[#8b93a8]">
                      {meta.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Delete section</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Remove this{" "}
              {deleteTarget ? SECTION_TYPE_META[deleteTarget.type].label : ""}{" "}
              section from the homepage? This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
              className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SectionEditorDialog
        open={editorOpen}
        section={editing}
        createType={createType}
        products={products}
        categories={categories}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
