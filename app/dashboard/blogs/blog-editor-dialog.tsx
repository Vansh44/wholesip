/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { MediaPickerDialog } from "./media-picker-dialog";
import { useState, useEffect, useCallback, useRef, useTransition } from "react";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createBlog,
  updateBlog,
  autosaveBlog,
} from "@/app/actions/blog-actions";
import type { BlogFormData } from "@/app/actions/blog-actions";
import type { Blog } from "./page";
import { PREDEFINED_CATEGORIES, PREDEFINED_TAGS } from "@/lib/blog-config";

// ── Helpers ───────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function calcReadingTime(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const count = text.split(" ").filter(Boolean).length;
  return Math.max(1, Math.ceil(count / 200));
}

// ── Types ─────────────────────────────────────────────────────

type Props = {
  open: boolean;
  blog: Blog | null;
  onClose: () => void;
  onSaved: () => void;
};

// ── Component ─────────────────────────────────────────────────

const ToolbarButton = ({
  onClick,
  active,
  title: btnTitle,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={btnTitle}
    style={{
      padding: "4px 8px",
      borderRadius: 4,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
      background: active ? "var(--dash-accent-soft)" : "transparent",
      color: active ? "var(--dash-accent)" : "inherit",
      transition: "all 0.1s",
      lineHeight: 1.4,
    }}
    onMouseDown={(e) => e.preventDefault()}
  >
    {children}
  </button>
);

export function BlogEditorDialog({ open, blog, onClose, onSaved }: Props) {
  const isEditing = !!blog;
  const [isPending, startTransition] = useTransition();
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  // ── Form state ──────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [author, setAuthor] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [featured, setFeatured] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [readingTime, setReadingTime] = useState(0);

  // ── TipTap ──────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      ImageExtension,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Start writing your blog post…" }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "blog-editor-content",
      },
    },
    onUpdate({ editor: ed }) {
      setHasUnsaved(true);
      setReadingTime(calcReadingTime(ed.getHTML()));
    },
  });

  const resetForm = useCallback(() => {
    setTitle("");
    setSlug("");
    setExcerpt("");
    setAuthor("");
    setCategories([]);
    setTags([]);
    setStatus("draft");
    setFeatured(false);
    setSeoTitle("");
    setSeoDescription("");
    setCoverImageUrl("");
    setReadingTime(0);
    setHasUnsaved(false);
    editor?.commands.clearContent();
  }, [editor]);

  // ── Populate form when editing ──────────────────────────────
  useEffect(() => {
    if (open && blog) {
      setTitle(blog.title);
      setSlug(blog.slug);
      setExcerpt(blog.excerpt ?? "");
      setAuthor(blog.author ?? "");
      setCategories(blog.categories ?? []);
      setTags(blog.tags ?? []);
      setStatus(blog.status);
      setFeatured(blog.featured);
      setSeoTitle(blog.seo_title ?? "");
      setSeoDescription(blog.seo_description ?? "");
      setCoverImageUrl(blog.cover_image_url ?? "");
      setReadingTime(blog.reading_time ?? 0);
      editor?.commands.setContent(blog.content ?? "");
    } else if (open && !blog) {
      resetForm();
    }
  }, [open, blog, editor, resetForm]);

  // ── Unsaved changes warning ─────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // ── Autosave (every 30s, only while editing existing blog) ──
  useEffect(() => {
    if (!open || !isEditing) return;
    autosaveTimer.current = setInterval(() => {
      if (hasUnsaved && blog) {
        const content = editor?.getHTML() ?? "";
        autosaveBlog(blog.id, {
          title,
          content,
          excerpt,
          author,
          categories,
          tags,
          seo_title: seoTitle,
          seo_description: seoDescription,
          cover_image_url: coverImageUrl,
        }).then((res) => {
          if (res.success) {
            setHasUnsaved(false);
          }
        });
      }
    }, 30_000);
    return () => {
      if (autosaveTimer.current) clearInterval(autosaveTimer.current);
    };
  }, [
    open,
    isEditing,
    hasUnsaved,
    blog,
    editor,
    title,
    excerpt,
    author,
    categories,
    tags,
    seoTitle,
    seoDescription,
    coverImageUrl,
  ]);

  // ── Title → slug auto-gen ───────────────────────────────────
  const handleTitleChange = useCallback(
    (val: string) => {
      setTitle(val);
      setHasUnsaved(true);
      if (!isEditing) {
        setSlug(slugify(val));
      }
    },
    [isEditing],
  );

  // ── Build form data ─────────────────────────────────────────
  const buildFormData = (): BlogFormData => ({
    title,
    slug,
    excerpt,
    content: editor?.getHTML() ?? "",
    cover_image_url: coverImageUrl,
    author,
    categories,
    tags,
    status,
    featured,
    seo_title: seoTitle,
    seo_description: seoDescription,
    reading_time: readingTime,
  });

  // ── Save ────────────────────────────────────────────────────
  const handleSave = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    startTransition(async () => {
      const data = buildFormData();
      const result = isEditing
        ? await updateBlog(blog!.id, data)
        : await createBlog(data);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isEditing ? "Blog updated" : "Blog created");
        setHasUnsaved(false);
        onSaved();
      }
    });
  };

  if (!editor) return null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            if (hasUnsaved) {
              if (window.confirm("You have unsaved changes. Discard them?")) {
                setHasUnsaved(false);
                onClose();
              }
            } else {
              onClose();
            }
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 top-0 left-0 z-50 flex max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-none bg-[#f2f4f7] p-0 text-[#000000] ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
          style={{ maxHeight: "100vh", width: "100vw", height: "100vh" }}
        >
          {/* Editor Top Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              background: "#ffffff",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => {
                  if (hasUnsaved) {
                    if (
                      window.confirm("You have unsaved changes. Discard them?")
                    ) {
                      setHasUnsaved(false);
                      onClose();
                    }
                  } else {
                    onClose();
                  }
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  padding: "4px 8px",
                  borderRadius: 6,
                  lineHeight: 1,
                }}
              >
                ←
              </button>
              <DialogHeader style={{ gap: 0 }}>
                <DialogTitle style={{ fontSize: 16, fontWeight: 700 }}>
                  {isEditing ? "Edit Blog" : "New Blog"}
                </DialogTitle>
                <DialogDescription
                  style={{ fontSize: 12, opacity: 0.6, margin: 0 }}
                >
                  {hasUnsaved ? "Unsaved changes" : "All changes saved"}
                  {readingTime > 0 && ` · ${readingTime} min read`}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className="dash-btn dash-btn-ghost"
                onClick={() => {
                  if (hasUnsaved) {
                    if (
                      window.confirm("You have unsaved changes. Discard them?")
                    ) {
                      setHasUnsaved(false);
                      onClose();
                    }
                  } else {
                    onClose();
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="dash-btn dash-btn-primary"
                onClick={handleSave}
                disabled={isPending}
              >
                {isPending
                  ? "Saving…"
                  : isEditing
                    ? "Update Blog"
                    : "Create Blog"}
              </button>
            </div>
          </div>

          {/* Main content - two columns */}
          <div
            style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {/* Left: Editor */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                borderRight: "1px solid rgba(0,0,0,0.08)",
              }}
            >
              {/* Toolbar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "8px 16px",
                  background: "#ffffff",
                  borderBottom: "1px solid rgba(0,0,0,0.06)",
                  flexWrap: "wrap",
                  flexShrink: 0,
                }}
              >
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
                  active={editor.isActive("heading", { level: 1 })}
                  title="Heading 1"
                >
                  H1
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  active={editor.isActive("heading", { level: 2 })}
                  title="Heading 2"
                >
                  H2
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                  active={editor.isActive("heading", { level: 3 })}
                  title="Heading 3"
                >
                  H3
                </ToolbarButton>

                <div
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(0,0,0,0.1)",
                    margin: "0 4px",
                  }}
                />

                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  active={editor.isActive("bold")}
                  title="Bold"
                >
                  B
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  active={editor.isActive("italic")}
                  title="Italic"
                >
                  <em>I</em>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  active={editor.isActive("underline")}
                  title="Underline"
                >
                  <u>U</u>
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  active={editor.isActive("strike")}
                  title="Strikethrough"
                >
                  <s>S</s>
                </ToolbarButton>

                <div
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(0,0,0,0.1)",
                    margin: "0 4px",
                  }}
                />

                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  active={editor.isActive("bulletList")}
                  title="Bullet List"
                >
                  • List
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  active={editor.isActive("orderedList")}
                  title="Ordered List"
                >
                  1. List
                </ToolbarButton>

                <div
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(0,0,0,0.1)",
                    margin: "0 4px",
                  }}
                />

                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  active={editor.isActive("blockquote")}
                  title="Blockquote"
                >
                  &ldquo;&rdquo;
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  active={editor.isActive("codeBlock")}
                  title="Code Block"
                >
                  {"</>"}
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setHorizontalRule().run()
                  }
                  title="Horizontal Rule"
                >
                  ―
                </ToolbarButton>

                <div
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(0,0,0,0.1)",
                    margin: "0 4px",
                  }}
                />

                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("left").run()
                  }
                  active={editor.isActive({ textAlign: "left" })}
                  title="Align Left"
                >
                  ⫷
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("center").run()
                  }
                  active={editor.isActive({ textAlign: "center" })}
                  title="Align Center"
                >
                  ☰
                </ToolbarButton>
                <ToolbarButton
                  onClick={() =>
                    editor.chain().focus().setTextAlign("right").run()
                  }
                  active={editor.isActive({ textAlign: "right" })}
                  title="Align Right"
                >
                  ⫸
                </ToolbarButton>

                <div
                  style={{
                    width: 1,
                    height: 18,
                    background: "rgba(0,0,0,0.1)",
                    margin: "0 4px",
                  }}
                />

                <ToolbarButton
                  onClick={() => {
                    const url = window.prompt("Link URL:");
                    if (url) {
                      editor.chain().focus().setLink({ href: url }).run();
                    }
                  }}
                  active={editor.isActive("link")}
                  title="Insert Link"
                >
                  🔗
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    const url = window.prompt("Image URL:");
                    if (url) {
                      editor.chain().focus().setImage({ src: url }).run();
                    }
                  }}
                  title="Insert Image"
                >
                  🖼
                </ToolbarButton>
              </div>

              {/* Editor content */}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "24px 32px",
                  background: "#ffffff",
                }}
              >
                <style>{`
                  .blog-editor-content {
                    min-height: 400px;
                    outline: none;
                    font-size: 15px;
                    line-height: 1.75;
                    color: #1a1a1a;
                    max-width: 720px;
                    margin: 0 auto;
                  }
                  .blog-editor-content h1 { font-size: 28px; font-weight: 700; margin: 24px 0 12px; line-height: 1.3; }
                  .blog-editor-content h2 { font-size: 22px; font-weight: 700; margin: 20px 0 10px; line-height: 1.3; }
                  .blog-editor-content h3 { font-size: 18px; font-weight: 600; margin: 16px 0 8px; line-height: 1.4; }
                  .blog-editor-content p { margin: 0 0 12px; }
                  .blog-editor-content ul, .blog-editor-content ol { padding-left: 24px; margin: 0 0 12px; }
                  .blog-editor-content li { margin-bottom: 4px; }
                  .blog-editor-content blockquote {
                    border-left: 3px solid var(--dash-accent, #4f6ef7);
                    padding: 8px 16px;
                    margin: 16px 0;
                    color: #555;
                    background: rgba(79, 110, 247, 0.04);
                    border-radius: 0 6px 6px 0;
                  }
                  .blog-editor-content pre {
                    background: #1e1e2e;
                    color: #e8ecf4;
                    padding: 16px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 16px 0;
                    font-family: var(--font-dash-mono), monospace;
                    font-size: 13px;
                    line-height: 1.6;
                  }
                  .blog-editor-content code {
                    background: rgba(0,0,0,0.06);
                    padding: 2px 5px;
                    border-radius: 4px;
                    font-family: var(--font-dash-mono), monospace;
                    font-size: 0.9em;
                  }
                  .blog-editor-content pre code {
                    background: none;
                    padding: 0;
                    border-radius: 0;
                    color: inherit;
                  }
                  .blog-editor-content a { color: var(--dash-accent, #4f6ef7); text-decoration: underline; }
                  .blog-editor-content img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 16px 0;
                  }
                  .blog-editor-content hr {
                    border: none;
                    border-top: 1px solid rgba(0,0,0,0.1);
                    margin: 24px 0;
                  }
                  .blog-editor-content .is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: rgba(0,0,0,0.3);
                    pointer-events: none;
                    height: 0;
                  }
                `}</style>
                <EditorContent editor={editor} />
              </div>
            </div>

            {/* Right sidebar: Settings */}
            <div
              style={{
                width: 360,
                flexShrink: 0,
                overflow: "auto",
                background: "#ffffff",
                padding: "20px",
              }}
            >
              {/* Basic Info */}
              <SectionTitle>Basic Info</SectionTitle>

              <FieldGroup label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Blog post title"
                  style={inputStyle}
                />
              </FieldGroup>

              <FieldGroup label="Slug">
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setHasUnsaved(true);
                  }}
                  placeholder="url-friendly-slug"
                  style={{
                    ...inputStyle,
                    fontFamily: "var(--font-dash-mono), monospace",
                    fontSize: 12,
                  }}
                />
              </FieldGroup>

              <FieldGroup label="Excerpt">
                <textarea
                  value={excerpt}
                  onChange={(e) => {
                    setExcerpt(e.target.value);
                    setHasUnsaved(true);
                  }}
                  placeholder="Brief summary of the blog post…"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </FieldGroup>

              <FieldGroup label="Author">
                <input
                  type="text"
                  value={author}
                  onChange={(e) => {
                    setAuthor(e.target.value);
                    setHasUnsaved(true);
                  }}
                  placeholder="Author name"
                  style={inputStyle}
                />
              </FieldGroup>

              <FieldGroup label="Categories">
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  {PREDEFINED_CATEGORIES.map((cat) => {
                    const isSelected = categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategories((prev) =>
                            isSelected
                              ? prev.filter((c) => c !== cat)
                              : [...prev, cat],
                          );
                          setHasUnsaved(true);
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 500,
                          border: isSelected
                            ? "1px solid transparent"
                            : "1px solid rgba(0,0,0,0.15)",
                          background: isSelected
                            ? "rgba(0,0,0,0.12)"
                            : "transparent",
                          color: isSelected ? "#000000" : "rgba(0,0,0,0.7)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              {/* Cover Image */}
              <div style={{ margin: "16px 0 0" }}>
                <SectionTitle>Cover Image</SectionTitle>
                {coverImageUrl ? (
                  <div
                    style={{
                      position: "relative",
                      borderRadius: 8,
                      overflow: "hidden",
                      marginBottom: 8,
                      border: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <img
                      src={coverImageUrl}
                      alt="Cover"
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    <button
                      onClick={() => {
                        setCoverImageUrl("");
                        setHasUnsaved(true);
                      }}
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "2px 6px",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : null}
                <button
                  className="dash-btn dash-btn-ghost"
                  style={{ width: "100%", fontSize: 12 }}
                  onClick={() => setMediaPickerOpen(true)}
                >
                  {coverImageUrl ? "Change Image" : "📷 Choose Cover Image"}
                </button>
              </div>

              {/* Publishing */}
              <div style={{ margin: "20px 0 0" }}>
                <SectionTitle>Publishing</SectionTitle>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      width: 56,
                    }}
                  >
                    Status
                  </label>
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      gap: 4,
                      background: "rgba(0,0,0,0.06)",
                      padding: 4,
                      borderRadius: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("draft");
                        setHasUnsaved(true);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        padding: "6px 12px",
                        border: "none",
                        borderRadius: 6,
                        background:
                          status === "draft" ? "#ffffff" : "transparent",
                        color:
                          status === "draft" ? "#000000" : "rgba(0,0,0,0.6)",
                        fontWeight: status === "draft" ? 600 : 500,
                        boxShadow:
                          status === "draft"
                            ? "0 1px 3px rgba(0,0,0,0.1)"
                            : "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("published");
                        setHasUnsaved(true);
                      }}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        padding: "6px 12px",
                        border: "none",
                        borderRadius: 6,
                        background:
                          status === "published" ? "#ffffff" : "transparent",
                        color:
                          status === "published"
                            ? "#000000"
                            : "rgba(0,0,0,0.6)",
                        fontWeight: status === "published" ? 600 : 500,
                        boxShadow:
                          status === "published"
                            ? "0 1px 3px rgba(0,0,0,0.1)"
                            : "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      Published
                    </button>
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => {
                      setFeatured(e.target.checked);
                      setHasUnsaved(true);
                    }}
                    style={{ accentColor: "var(--dash-accent)" }}
                  />
                  Featured post
                </label>
              </div>

              {/* Tags */}
              <div style={{ margin: "20px 0 0" }}>
                <SectionTitle>Tags</SectionTitle>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  {PREDEFINED_TAGS.map((tag) => {
                    const isSelected = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setTags((prev) =>
                            isSelected
                              ? prev.filter((t) => t !== tag)
                              : [...prev, tag],
                          );
                          setHasUnsaved(true);
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 500,
                          border: isSelected
                            ? "1px solid transparent"
                            : "1px solid rgba(0,0,0,0.15)",
                          background: isSelected
                            ? "rgba(0,0,0,0.12)"
                            : "transparent",
                          color: isSelected ? "#000000" : "rgba(0,0,0,0.7)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SEO */}
              <div style={{ margin: "20px 0 0" }}>
                <SectionTitle>SEO</SectionTitle>
                <FieldGroup label="SEO Title">
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => {
                      setSeoTitle(e.target.value);
                      setHasUnsaved(true);
                    }}
                    placeholder="SEO-optimized title"
                    style={inputStyle}
                  />
                  <CharCount current={seoTitle.length} max={60} />
                </FieldGroup>

                <FieldGroup label="SEO Description">
                  <textarea
                    value={seoDescription}
                    onChange={(e) => {
                      setSeoDescription(e.target.value);
                      setHasUnsaved(true);
                    }}
                    placeholder="Meta description for search engines"
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                  />
                  <CharCount current={seoDescription.length} max={160} />
                </FieldGroup>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Media Picker */}
      <MediaPickerDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => {
          setCoverImageUrl(url);
          setHasUnsaved(true);
          setMediaPickerOpen(false);
        }}
      />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 10,
        color: "rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </div>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 500,
          marginBottom: 4,
          color: "rgba(0,0,0,0.7)",
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function CharCount({ current, max }: { current: number; max: number }) {
  const isOver = current > max;
  return (
    <div
      style={{
        fontSize: 10,
        textAlign: "right",
        marginTop: 2,
        color: isOver ? "var(--dash-red)" : "rgba(0,0,0,0.35)",
      }}
    >
      {current}/{max}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid rgba(0,0,0,0.1)",
  background: "#f8f9fb",
  fontSize: 13,
  color: "#1a1a1a",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color 0.15s",
};
