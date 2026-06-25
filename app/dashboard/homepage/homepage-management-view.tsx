"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  LayoutTemplate,
} from "lucide-react";
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
import type { BlogOption, CategoryOption, ProductOption } from "./page";

type Props = {
  sections: HomepageSection[];
  products: ProductOption[];
  categories: CategoryOption[];
  blogs: BlogOption[];
  canManage?: boolean;
};

export function HomepageManagementView({
  sections,
  products,
  categories,
  blogs,
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
          <h1>Homepage</h1>
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
            <Plus className="h-4 w-4" />
            Add section
          </button>
        )}
      </header>

      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <div className="dash-card-title">Sections</div>
            <div className="dash-card-sub">
              {ordered.length} {ordered.length === 1 ? "section" : "sections"}
            </div>
          </div>
        </div>

        {ordered.length === 0 ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">
              <LayoutTemplate className="h-5 w-5" />
            </span>
            <div className="dash-empty-title">No sections yet</div>
            <p className="dash-empty-text">
              Add your first homepage section — it renders below the hero.
            </p>
            {canManage && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => setTypeChooserOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add section
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                {canManage && <th className="w-16">Order</th>}
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
                            className="text-muted-foreground hover:bg-muted flex h-7 w-6 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(i, 1)}
                            disabled={i === ordered.length - 1 || isPending}
                            title="Move down"
                            className="text-muted-foreground hover:bg-muted flex h-7 w-6 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-2.5">
                        {Icon && (
                          <span className="dash-thumb dash-thumb-empty">
                            <Icon className="h-4 w-4" />
                          </span>
                        )}
                        <div>
                          <div className="dash-cell-title">{meta.label}</div>
                          <div className="dash-cell-sub">
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
                        } ${canManage ? "cursor-pointer" : "cursor-default"} border-none`}
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
                          <DropdownMenuTrigger className="dash-row-menu">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[160px]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openEdit(s)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className="cursor-pointer"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Add a section</DialogTitle>
            <DialogDescription>
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
                  className="hover:border-primary hover:bg-muted flex w-full items-start gap-3 rounded-lg border p-3 text-left"
                >
                  {Icon && (
                    <span className="dash-thumb dash-thumb-empty h-9 w-9">
                      <Icon className="h-4 w-4" />
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-semibold">{meta.label}</div>
                    <div className="text-muted-foreground text-xs">
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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete section</DialogTitle>
            <DialogDescription>
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
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
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
        blogs={blogs}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
    </div>
  );
}
