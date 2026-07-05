"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EditorSetting } from "@/app/actions/store-settings";
import { FeatureToggles } from "../../components/feature-toggles";
import {
  createBlogTaxonomyItem,
  renameBlogTaxonomyItem,
  deleteBlogTaxonomyItem,
  type TaxonomyKind,
} from "@/app/actions/blog-taxonomy-actions";
import type { BlogTaxonomy, TaxonomyItem } from "@/lib/blog-taxonomy";

// ── Taxonomy manager (categories / tags) ─────────────────────

function TaxonomyManager({
  kind,
  title,
  description,
  items,
  canManage,
}: {
  kind: TaxonomyKind;
  title: string;
  description: string;
  items: TaxonomyItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TaxonomyItem | null>(null);

  const singular = kind === "category" ? "category" : "tag";

  const run = (
    action: () => Promise<{ error?: string; success?: boolean }>,
    successMsg: string,
    after?: () => void,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(successMsg);
      after?.();
      router.refresh();
    });
  };

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    run(
      () => createBlogTaxonomyItem(kind, name),
      `Added "${name}"`,
      () => setNewName(""),
    );
  };

  const handleRename = (item: TaxonomyItem) => {
    const name = editName.trim();
    if (!name || name === item.name) {
      setEditingId(null);
      return;
    }
    run(
      () => renameBlogTaxonomyItem(kind, item.id, name),
      `Renamed to "${name}" — existing posts updated`,
      () => setEditingId(null),
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    run(
      () => deleteBlogTaxonomyItem(kind, deleteTarget.id),
      `Deleted "${deleteTarget.name}" — removed from existing posts`,
      () => setDeleteTarget(null),
    );
  };

  return (
    <section className="dash-card">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">{title}</div>
          <div className="dash-card-sub">{description}</div>
        </div>
      </div>
      <div className="dash-card-body">
        {items.length === 0 ? (
          <p className="py-2 text-[13px] text-[#8b93a3]">
            No {title.toLowerCase()} yet.
            {canManage && ` Add your first ${singular} below.`}
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(17,24,39,0.06)]">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                {editingId === item.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(item);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={40}
                      className="h-8 flex-1 text-sm"
                      aria-label={`Rename ${item.name}`}
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="dash-icon-btn"
                        title="Save"
                        disabled={isPending}
                        onClick={() => handleRename(item)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        className="dash-icon-btn"
                        title="Cancel"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{item.name}</span>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          className="dash-icon-btn"
                          title={`Rename ${singular}`}
                          disabled={isPending}
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          className="dash-icon-btn text-destructive"
                          title={`Delete ${singular}`}
                          disabled={isPending}
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              maxLength={40}
              placeholder={`New ${singular}…`}
              className="flex-1 text-sm"
              aria-label={`New ${singular} name`}
            />
            <Button
              variant="outline"
              disabled={isPending || !newName.trim()}
              onClick={handleAdd}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              The {singular} is removed from every blog post that uses it. The
              posts themselves are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleDelete}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ── Page view ─────────────────────────────────────────────────

export function BlogSettingsView({
  plan,
  initialSettings,
  taxonomy,
  canManage,
}: {
  plan: string;
  initialSettings: EditorSetting[];
  taxonomy: BlogTaxonomy;
  canManage: boolean;
}) {
  return (
    <div className="dash-page-enter mx-auto w-full max-w-3xl">
      <header className="dash-page-header">
        <Link
          href="/dashboard/blogs"
          className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#5b6472] hover:text-[#111827]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All blogs
        </Link>
        <h1>Blog settings</h1>
        <p>
          Configure customer submissions and manage the categories and tags your
          blog editors offer.
        </p>
      </header>

      <div className="mt-4 space-y-5">
        {initialSettings.length > 0 && (
          <FeatureToggles
            title="Customer submissions"
            successMessage="Blog settings saved."
            plan={plan}
            initialSettings={initialSettings}
            canManage={canManage}
          />
        )}
        <TaxonomyManager
          kind="category"
          title="Categories"
          description="Broad topics readers browse by — shown on posts and as blog filters."
          items={taxonomy.categories}
          canManage={canManage}
        />
        <TaxonomyManager
          kind="tag"
          title="Tags"
          description="Finer-grained labels for search and related-post matching."
          items={taxonomy.tags}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
