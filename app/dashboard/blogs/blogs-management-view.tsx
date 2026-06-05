"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
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
import {
  deleteBlog,
  publishBlog,
  unpublishBlog,
  approveCustomerBlog,
  rejectCustomerBlog,
} from "@/app/actions/blog-actions";
import { BlogEditorDialog } from "./blog-editor-dialog";
import type { Blog } from "./page";

type FilterTab = "all" | "published" | "drafts" | "featured" | "pending";

type Props = {
  blogs: Blog[];
};

export function BlogsManagementView({ blogs }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Blog | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Blog | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);

  // ── Filtering & Search ────────────────────────────────────
  const filteredBlogs = useMemo(() => {
    let result = [...blogs];

    // Tab filter
    switch (filter) {
      case "published":
        result = result.filter((b) => b.status === "published");
        break;
      case "drafts":
        result = result.filter((b) => b.status === "draft");
        break;
      case "featured":
        result = result.filter((b) => b.featured);
        break;
      case "pending":
        result = result.filter((b) => b.status === "pending_review");
        break;
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.categories &&
            b.categories.some((c) => c.toLowerCase().includes(q))) ||
          (b.tags && b.tags.some((t) => t.toLowerCase().includes(q))),
      );
    }

    return result;
  }, [blogs, filter, search]);

  // ── Tab counts ────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      all: blogs.length,
      published: blogs.filter((b) => b.status === "published").length,
      drafts: blogs.filter((b) => b.status === "draft").length,
      featured: blogs.filter((b) => b.featured).length,
      pending: blogs.filter((b) => b.status === "pending_review").length,
    }),
    [blogs],
  );

  // ── Actions ───────────────────────────────────────────────
  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteBlog(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Blog deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  const handleTogglePublish = (blog: Blog) => {
    startTransition(async () => {
      const action = blog.status === "published" ? unpublishBlog : publishBlog;
      const result = await action(blog.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          blog.status === "published" ? "Blog unpublished" : "Blog published",
        );
        router.refresh();
      }
    });
  };

  const handleApprove = (blog: Blog) => {
    startTransition(async () => {
      const result = await approveCustomerBlog(blog.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Blog approved and published!");
        router.refresh();
      }
    });
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    startTransition(async () => {
      const result = await rejectCustomerBlog(rejectTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Blog rejected and deleted");
        setRejectTarget(null);
        router.refresh();
      }
    });
  };

  const openEditor = (blog?: Blog) => {
    setEditingBlog(blog ?? null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingBlog(null);
  };

  const handleEditorSaved = () => {
    closeEditor();
    router.refresh();
  };

  // ── Helpers ───────────────────────────────────────────────
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "published", label: `Published (${counts.published})` },
    { key: "drafts", label: `Drafts (${counts.drafts})` },
    { key: "featured", label: `Featured (${counts.featured})` },
    { key: "pending", label: `Pending (${counts.pending})` },
  ];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="dash-page-enter">
      {/* Page Header */}
      <header className="dash-page-header row">
        <div>
          <h1>✍️ Blogs</h1>
          <p>Create, edit, and manage your blog posts</p>
        </div>
        <button
          className="dash-btn dash-btn-primary shrink-0"
          onClick={() => openEditor()}
        >
          ＋ New Blog
        </button>
      </header>

      {/* Toolbar: Tabs + Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div className="dash-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
              style={
                tab.key === "pending" && counts.pending > 0
                  ? {
                      color: "#f59e0b",
                      borderColor: filter === "pending" ? "#f59e0b" : undefined,
                    }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dash-search-bar" style={{ width: 260 }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5, flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            placeholder="Search title, tags, categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Blog Table */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Blog Posts
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filteredBlogs.length}{" "}
              {filteredBlogs.length === 1 ? "post" : "posts"}
            </span>
          </div>
        </div>

        {filteredBlogs.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {search || filter !== "all"
                ? "No blogs match your filters"
                : "No blogs yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {search || filter !== "all"
                ? "Try adjusting your search or filter criteria"
                : "Create your first blog post to get started"}
            </div>
            {!search && filter === "all" && (
              <button
                className="dash-btn dash-btn-primary"
                onClick={() => openEditor()}
              >
                ＋ New Blog
              </button>
            )}
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Cover</th>
                <th>Title</th>
                <th>Categories</th>
                <th>Author</th>
                <th>Status</th>
                <th>Published</th>
                <th>Tags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBlogs.map((blog) => (
                <tr key={blog.id}>
                  {/* Cover */}
                  <td>
                    {blog.cover_image_url ? (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          overflow: "hidden",
                          position: "relative",
                          flexShrink: 0,
                        }}
                      >
                        <Image
                          src={blog.cover_image_url}
                          alt={blog.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          background: "var(--dash-surface-2)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          opacity: 0.4,
                        }}
                      >
                        🖼
                      </div>
                    )}
                  </td>

                  {/* Title */}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {blog.title}
                      {blog.featured && (
                        <span
                          title="Featured"
                          style={{ marginLeft: 6, fontSize: 12 }}
                        >
                          ⭐
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.5,
                        fontFamily: "var(--font-dash-mono), monospace",
                        marginTop: 2,
                      }}
                    >
                      /{blog.slug}
                    </div>
                  </td>

                  {/* Category */}
                  <td className="dash-table-cell">
                    {blog.categories && blog.categories.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          flexWrap: "wrap",
                        }}
                      >
                        {blog.categories.map((c) => (
                          <span
                            key={c}
                            style={{
                              padding: "2px 6px",
                              background: "rgba(0,0,0,0.04)",
                              borderRadius: "4px",
                              fontSize: "11px",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Author */}
                  <td className="text-muted">
                    {blog.author || "—"}
                    {blog.is_customer_submission && blog.submitter_name && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 11, opacity: 0.7 }}>
                          {blog.submitter_name}
                        </span>
                        <span
                          style={{
                            marginLeft: 6,
                            padding: "1px 6px",
                            fontSize: 9,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            background: "rgba(139, 92, 246, 0.15)",
                            color: "#a78bfa",
                            borderRadius: 4,
                          }}
                        >
                          Community
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td>
                    <span
                      className={`dash-badge ${
                        blog.status === "published"
                          ? "dash-badge-green"
                          : blog.status === "pending_review"
                            ? "dash-badge-amber"
                            : "dash-badge-amber"
                      }`}
                      style={
                        blog.status === "pending_review"
                          ? {
                              background: "rgba(139, 92, 246, 0.15)",
                              color: "#a78bfa",
                            }
                          : undefined
                      }
                    >
                      {blog.status === "published"
                        ? "Published"
                        : blog.status === "pending_review"
                          ? "Pending"
                          : "Draft"}
                    </span>
                  </td>

                  {/* Published date */}
                  <td className="text-dim font-mono-dash">
                    {formatDate(blog.published_at)}
                  </td>

                  {/* Tags */}
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        maxWidth: 180,
                      }}
                    >
                      {blog.tags.length > 0
                        ? blog.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="dash-badge dash-badge-grey"
                              style={{ fontSize: 10, padding: "2px 7px" }}
                            >
                              {tag}
                            </span>
                          ))
                        : "—"}
                      {blog.tags.length > 3 && (
                        <span
                          className="dash-badge dash-badge-grey"
                          style={{ fontSize: 10, padding: "2px 7px" }}
                        >
                          +{blog.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                        Actions
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[160px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                      >
                        {blog.status === "pending_review" ? (
                          <>
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => openEditor(blog)}
                            >
                              📝 Review &amp; Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                            <DropdownMenuItem
                              className="cursor-pointer text-[#22c55e] focus:bg-[rgba(34,197,94,0.12)] focus:text-[#22c55e]"
                              onClick={() => handleApprove(blog)}
                              disabled={isPending}
                            >
                              ✅ Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                              onClick={() => setRejectTarget(blog)}
                            >
                              ❌ Reject
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => openEditor(blog)}
                            >
                              ✏️ Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => handleTogglePublish(blog)}
                              disabled={isPending}
                            >
                              {blog.status === "published"
                                ? "📥 Unpublish"
                                : "🚀 Publish"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() =>
                                window.open(
                                  `/pages/blogs/${blog.slug}`,
                                  "_blank",
                                )
                              }
                            >
                              👁 Preview
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                            <DropdownMenuItem
                              className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                              onClick={() => setDeleteTarget(blog)}
                            >
                              🗑 Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Delete Blog</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Are you sure you want to delete &ldquo;{deleteTarget?.title}
              &rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-[#8b93a8]">
              Slug: /{deleteTarget?.slug}
            </p>
          </div>
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

      {/* Reject Confirmation Dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">
              Reject Submission
            </DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Are you sure you want to reject &ldquo;{rejectTarget?.title}
              &rdquo;
              {rejectTarget?.submitter_name
                ? ` by ${rejectTarget.submitter_name}`
                : ""}
              ? This will permanently delete the submission.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-[#8b93a8]">
              Slug: /{rejectTarget?.slug}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={isPending}
              className="border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8ecf4] hover:bg-[#1a1f2e]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blog Editor Dialog */}
      <BlogEditorDialog
        open={editorOpen}
        blog={editingBlog}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />
    </div>
  );
}
