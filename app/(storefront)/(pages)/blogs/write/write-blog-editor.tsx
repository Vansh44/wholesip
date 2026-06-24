"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/app/(storefront)/components/auth/AuthProvider";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { SlashCommand } from "./slash-command";
import { PREDEFINED_CATEGORIES, PREDEFINED_TAGS } from "@/lib/blog-config";
import {
  uploadImage,
  deleteImage,
  extractPathFromUrl,
} from "@/lib/supabase/storage";
import {
  submitCustomerBlog,
  updateCustomerBlog,
  saveCustomerBlogDraft,
  deleteCustomerBlog,
  revertCustomerBlogToDraft,
  getMySubmissions,
} from "@/app/actions/blog-actions";
import { updateCustomerProfile } from "@/app/actions/customer-profile";
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  ArrowLeft,
  X,
  Upload,
  CheckCircle,
  FileText,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";

type Mode = "write" | "edit" | "success" | "submissions";

interface Submission {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image_url: string | null;
  author: string | null;
  status: "draft" | "published" | "pending_review";
  categories: string[] | null;
  tags: string[] | null;
  reading_time: number | null;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  is_customer_submission: boolean;
}

export default function WriteBlogEditor({
  initialMode = "write",
}: {
  initialMode?: Mode;
} = {}) {
  const {
    user,
    customer,
    loading: authLoading,
    openAuthModal,
    refreshCustomer,
  } = useAuth();
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);
  // Status of the post currently open in the editor (null for a brand-new one).
  // Drives the button labels and whether "Save as draft" is offered.
  const [editingStatus, setEditingStatus] = useState<
    Submission["status"] | null
  >(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // Submission the user is about to delete (drives the confirm modal).
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  // Email is required before a submission can go to review (so the author can
  // be notified on approve/reject). We only prompt when it's missing.
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [sessionUploadedImages, setSessionUploadedImages] = useState<string[]>(
    [],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: 'Write your story, or press "/" for blocks...',
      }),
      SlashCommand,
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "blog-prose focus:outline-none min-h-[400px]",
      },
    },
  });

  useEffect(() => {
    if (user && customer && mode === "submissions") {
      loadSubmissions();
    }
  }, [user, customer, mode]);

  const loadSubmissions = async () => {
    setLoadingSubmissions(true);
    const result = await getMySubmissions();
    if (result.success && result.data) {
      setSubmissions(result.data.submissions as Submission[]);
    } else {
      toast.error(result.error || "Failed to load submissions");
    }
    setLoadingSubmissions(false);
  };

  // Reactive reading-time estimate. useEditorState re-subscribes to the editor
  // so this recomputes on every content change (typing, paste, and programmatic
  // setContent in edit mode) — a plain `editor.getText()` read during render
  // would stay frozen because useEditor doesn't re-render on each keystroke.
  const readingTime =
    useEditorState({
      editor,
      selector: ({ editor }) => {
        if (!editor) return 0;
        const text = editor.getText().trim();
        if (!text) return 0;
        const words = text.split(/\s+/).length;
        return Math.max(1, Math.ceil(words / 225));
      },
    }) ?? 0;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB.");
      return;
    }

    const toastId = toast.loading("Uploading image...");

    try {
      // If there's an existing image that was uploaded during this session, clean it up
      if (coverImageUrl && sessionUploadedImages.includes(coverImageUrl)) {
        const oldPath = extractPathFromUrl(coverImageUrl);
        if (oldPath) {
          deleteImage(oldPath).catch(console.error);
        }
      }

      const url = await uploadImage(file, { folder: "blog-covers" });
      setCoverImageUrl(url);
      setSessionUploadedImages((prev) => [...prev, url]);
      toast.success("Image uploaded successfully!", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload image. Please try again.", { id: toastId });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeCoverImage = () => {
    // Clean up if the image was uploaded during this session
    if (coverImageUrl && sessionUploadedImages.includes(coverImageUrl)) {
      const path = extractPathFromUrl(coverImageUrl);
      if (path) {
        deleteImage(path).catch(console.error);
      }
    }
    setCoverImageUrl("");
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addEditorImage = () => {
    const url = window.prompt("Enter the URL of the image:");
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addEditorLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  // Clears the editor back to a blank, brand-new post.
  const resetForm = () => {
    setTitle("");
    setExcerpt("");
    setCoverImageUrl("");
    setSelectedCategories([]);
    setSelectedTags([]);
    editor?.commands.setContent("");
    setEditingBlogId(null);
    setEditingStatus(null);
  };

  // Saves the current post as a private draft (only a title is required) so the
  // author can come back and keep writing later. Keeps them in the editor.
  const handleSaveDraft = () => {
    if (!title.trim()) {
      toast.error("Add a title before saving your draft");
      return;
    }
    if (!editor) return;

    setSavingDraft(true);
    startTransition(async () => {
      const formData = {
        title,
        excerpt,
        content: editor.getHTML(),
        cover_image_url: coverImageUrl,
        categories: selectedCategories,
        tags: selectedTags,
      };

      const result = await saveCustomerBlogDraft(
        formData,
        editingBlogId ?? undefined,
      );
      setSavingDraft(false);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Keep editing the same draft on subsequent saves.
      const newId = (result.data as { id?: string } | undefined)?.id;
      if (newId) setEditingBlogId(newId);
      setEditingStatus("draft");
      setMode("edit");
      toast.success(
        "Draft saved — you can finish it anytime from My Submissions",
      );
    });
  };

  // Actually sends the blog to review. Assumes validation already passed.
  const performSubmit = () => {
    if (!editor) return;
    startTransition(async () => {
      const formData = {
        title,
        excerpt,
        content: editor.getHTML(),
        cover_image_url: coverImageUrl,
        categories: selectedCategories,
        tags: selectedTags,
      };

      // An existing draft or pending post is updated (a draft gets promoted to
      // review); a brand-new post is created fresh.
      const result = editingBlogId
        ? await updateCustomerBlog(editingBlogId, formData)
        : await submitCustomerBlog(formData);

      if (result.error) {
        toast.error(result.error);
      } else {
        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
        setMode("success");
        resetForm();
      }
    });
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Please enter a title for your blog");
      return;
    }

    if (!editor || editor.getText().trim().length < 50) {
      toast.error("Please write a bit more content before submitting");
      return;
    }

    if (selectedCategories.length === 0) {
      toast.error("Please select at least one category");
      return;
    }

    if (selectedTags.length === 0) {
      toast.error("Please select at least one tag");
      return;
    }

    // We need a contact email to notify the author when the blog is approved
    // or rejected. Phone sign-up leaves email blank — prompt for it first.
    if (!customer?.email) {
      setEmailInput("");
      setEmailError("");
      setShowEmailModal(true);
      return;
    }

    performSubmit();
  };

  // Saves the email the author entered, then proceeds with the submission.
  const handleEmailContinue = async () => {
    const email = emailInput.trim();
    // Basic shape check; the server re-validates and enforces uniqueness.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!customer) return;

    setSavingEmail(true);
    setEmailError("");

    const fd = new FormData();
    fd.set("firstName", customer.first_name);
    fd.set("lastName", customer.last_name ?? "");
    fd.set("email", email);

    const result = await updateCustomerProfile(fd);
    setSavingEmail(false);

    if (result.error) {
      setEmailError(result.error);
      return;
    }

    await refreshCustomer();
    setShowEmailModal(false);
    performSubmit();
  };

  const handleEditSubmission = (blog: Submission) => {
    setTitle(blog.title);
    setExcerpt(blog.excerpt || "");
    setCoverImageUrl(blog.cover_image_url || "");
    setSelectedCategories(blog.categories || []);
    setSelectedTags(blog.tags || []);
    if (editor) {
      editor.commands.setContent(blog.content || "");
    }
    setEditingBlogId(blog.id);
    setEditingStatus(blog.status);
    setMode("edit");
  };

  // Whole-card click: published posts open their public page; drafts and
  // pending submissions open in the editor to keep writing / editing.
  const handleCardClick = (blog: Submission) => {
    if (blog.status === "published") {
      router.push(`/blogs/${blog.slug}`);
    } else {
      handleEditSubmission(blog);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    startTransition(async () => {
      const result = await deleteCustomerBlog(target.id);
      setDeleting(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSubmissions((prev) => prev.filter((s) => s.id !== target.id));
      setDeleteTarget(null);
      toast.success("Blog deleted");
    });
  };

  // Pull a pending submission back out of the review queue, into a draft.
  const handleMoveToDraft = (blog: Submission) => {
    setRevertingId(blog.id);
    startTransition(async () => {
      const result = await revertCustomerBlogToDraft(blog.id);
      setRevertingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSubmissions((prev) =>
        prev.map((s) => (s.id === blog.id ? { ...s, status: "draft" } : s)),
      );
      toast.success("Moved back to draft");
    });
  };

  if (authLoading) {
    return (
      <div className="write-blog-page flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-4 border-[var(--blog-accent)] border-t-transparent animate-spin mb-4"></div>
          <p className="text-[var(--blog-muted)] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !customer) {
    return (
      <div className="write-blog-page">
        <div className="write-blog-auth-gate">
          <div className="write-blog-auth-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </div>
          <h1 className="write-blog-auth-title">Share Your Story</h1>
          <p className="write-blog-auth-desc">
            Sign in to write and publish your own blog posts on Soakd. Join our
            community of health and wellness enthusiasts.
          </p>
          <button className="write-blog-submit-btn" onClick={openAuthModal}>
            Sign In to Start Writing
          </button>
          <Link href="/blogs" className="write-blog-auth-back">
            <ArrowLeft size={16} /> Back to Blogs
          </Link>
        </div>
      </div>
    );
  }

  if (mode === "success") {
    return (
      <div className="write-blog-page">
        <div className="write-blog-success">
          <div className="write-blog-success-icon">
            <CheckCircle size={64} />
          </div>
          <h1 className="write-blog-success-title">Successfully Submitted!</h1>
          <p className="write-blog-success-desc">
            Your blog post has been submitted and is pending review. Our team
            will read it over and publish it shortly.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              className="write-blog-submit-btn bg-white text-[var(--blog-dark)] border border-[var(--blog-border)] hover:bg-[var(--blog-bg-alt)]"
              onClick={() => setMode("submissions")}
            >
              View My Submissions
            </button>
            <Link href="/blogs" className="write-blog-submit-btn">
              Back to Blogs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "submissions") {
    return (
      <div className="write-blog-page">
        <div className="write-blog-submissions">
          <div className="write-blog-subs-head">
            <div>
              <Link href="/blogs" className="write-blog-subs-back">
                <ArrowLeft size={16} /> Back to Blogs
              </Link>
              <h1 className="write-blog-subs-title">My Submissions</h1>
              {!loadingSubmissions && submissions.length > 0 && (
                <p className="write-blog-subs-count">
                  {submissions.length}{" "}
                  {submissions.length === 1 ? "post" : "posts"}
                </p>
              )}
            </div>
            <button
              className="write-blog-submit-btn"
              onClick={() => {
                resetForm();
                setMode("write");
              }}
            >
              <Plus size={18} /> Write New Blog
            </button>
          </div>

          {loadingSubmissions ? (
            <div className="write-blog-subs-grid">
              {[0, 1, 2].map((i) => (
                <div key={i} className="write-blog-skeleton-card">
                  <div className="write-blog-skeleton-cover" />
                  <div className="write-blog-skeleton-body">
                    <div className="write-blog-skeleton-line short" />
                    <div className="write-blog-skeleton-line" />
                  </div>
                </div>
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="write-blog-subs-empty">
              <div className="write-blog-subs-empty-icon">
                <FileText size={32} />
              </div>
              <h2>No submissions yet</h2>
              <p>
                You haven&apos;t submitted any blogs yet. Start writing to share
                your story with the community.
              </p>
              <button
                className="write-blog-submit-btn"
                onClick={() => {
                  resetForm();
                  setMode("write");
                }}
              >
                <Plus size={18} /> Write Your First Blog
              </button>
            </div>
          ) : (
            <div className="write-blog-subs-grid">
              {submissions.map((blog) => (
                <div
                  key={blog.id}
                  className="write-blog-submission-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleCardClick(blog)}
                  onKeyDown={(e) => {
                    if (
                      e.target === e.currentTarget &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      handleCardClick(blog);
                    }
                  }}
                >
                  <div className="write-blog-subs-cover">
                    {blog.cover_image_url ? (
                      <Image
                        src={blog.cover_image_url}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 100vw, 360px"
                      />
                    ) : (
                      <div className="write-blog-subs-cover-empty">
                        <ImageIcon size={28} />
                      </div>
                    )}
                    <span
                      className={`write-blog-status-badge ${
                        blog.status === "published"
                          ? "published"
                          : blog.status === "draft"
                            ? "draft"
                            : "pending"
                      }`}
                    >
                      {blog.status === "published"
                        ? "Published"
                        : blog.status === "draft"
                          ? "Draft"
                          : "Pending Review"}
                    </span>

                    {(blog.status === "draft" ||
                      blog.status === "pending_review") && (
                      <div className="write-blog-subs-actions">
                        {blog.status === "pending_review" && (
                          <button
                            type="button"
                            className="write-blog-subs-action"
                            title={
                              revertingId === blog.id
                                ? "Moving…"
                                : "Move back to draft"
                            }
                            aria-label="Move back to draft"
                            disabled={isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveToDraft(blog);
                            }}
                          >
                            <Undo2 size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="write-blog-subs-action write-blog-subs-action--danger"
                          title="Delete blog"
                          aria-label="Delete blog"
                          disabled={isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(blog);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="write-blog-subs-body">
                    <h3 className="write-blog-subs-card-title">{blog.title}</h3>
                    {blog.excerpt && (
                      <p className="write-blog-subs-excerpt">{blog.excerpt}</p>
                    )}
                    <div className="write-blog-subs-meta">
                      <span className="write-blog-subs-date">
                        <Clock size={13} />
                        {new Date(blog.created_at).toLocaleDateString()}
                      </span>
                      <span className="write-blog-subs-edit" aria-hidden>
                        <Pencil size={13} />{" "}
                        {blog.status === "draft"
                          ? "Continue"
                          : blog.status === "published"
                            ? "View"
                            : "Edit"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {deleteTarget && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !deleting) {
                setDeleteTarget(null);
              }
            }}
            role="dialog"
            aria-modal="true"
          >
            <div
              style={{
                background: "#fff",
                borderRadius: 16,
                maxWidth: 420,
                width: "100%",
                padding: 28,
                boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              }}
            >
              <h2 className="text-xl font-semibold text-[var(--blog-dark)] mb-2">
                Delete this blog?
              </h2>
              <p className="text-sm text-[var(--blog-muted)] mb-5">
                &ldquo;{deleteTarget.title || "Untitled"}&rdquo; will be
                permanently deleted. This can&apos;t be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  className="px-5 py-2.5 rounded-full border border-[var(--blog-border)] bg-transparent text-[var(--blog-dark)] font-medium hover:bg-[var(--blog-bg-alt)] transition-colors disabled:opacity-50"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="px-5 py-2.5 rounded-full bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                  onClick={confirmDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="write-blog-page">
      <div className="write-blog-header">
        <div className="flex flex-col gap-1">
          <Link
            href="/blogs"
            className="flex items-center gap-2 text-[var(--blog-muted)] hover:text-[var(--blog-dark)] transition-colors text-sm font-medium mb-1"
          >
            <ArrowLeft size={16} /> Back to Blogs
          </Link>
          <h1 className="text-xl font-semibold text-[var(--blog-dark)]">
            {editingStatus === "draft"
              ? "Continue Your Draft"
              : mode === "edit"
                ? "Edit Submission"
                : "Write Your Blog"}
          </h1>
        </div>
        <div className="write-blog-header-actions">
          <button
            className="write-blog-ghost-btn"
            onClick={() => setMode("submissions")}
          >
            My Submissions
          </button>
          {editingStatus !== "pending_review" && (
            <button
              className="write-blog-ghost-btn"
              onClick={handleSaveDraft}
              disabled={isPending}
            >
              {savingDraft ? "Saving…" : "Save as draft"}
            </button>
          )}
          <button
            className="write-blog-submit-btn"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && !savingDraft
              ? "Submitting..."
              : editingStatus === "pending_review"
                ? "Save Changes"
                : "Submit for Review"}
          </button>
        </div>
      </div>

      <div className="write-blog-canvas">
        {/* Title */}
        <input
          type="text"
          placeholder="Your blog title..."
          className="write-blog-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Cover Image */}
        <section className="wb-section">
          <span className="wb-label">Cover Image</span>
          {coverImageUrl ? (
            <div className="write-blog-cover-preview">
              <Image
                src={coverImageUrl}
                alt="Cover"
                fill
                sizes="(max-width: 768px) 100vw, 720px"
              />
              <button
                type="button"
                className="remove-btn"
                onClick={removeCoverImage}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              className="write-blog-cover-upload"
              onClick={(e) => {
                if (e.target !== fileInputRef.current) {
                  fileInputRef.current?.click();
                }
              }}
            >
              <Upload size={26} className="mb-3 text-[var(--blog-muted)]" />
              <p className="text-sm font-medium text-[var(--blog-dark)]">
                Click to upload cover
              </p>
              <p className="text-xs text-[var(--blog-faint)] mt-1">
                16:9 ratio recommended
              </p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
              />
            </div>
          )}
        </section>

        {/* Excerpt */}
        <section className="wb-section">
          <span className="wb-label">Excerpt</span>
          <textarea
            className="write-blog-textarea"
            placeholder="A brief summary of your post..."
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={200}
            rows={3}
          />
          <div className="write-blog-char-count">{excerpt.length}/200</div>
        </section>

        {/* Content */}
        <section className="wb-section">
          <span className="wb-label">Content</span>
          <div className="write-blog-editor-area">
            {editor && (
              <BubbleMenu
                editor={editor}
                className="write-blog-bubble-menu"
                options={{ placement: "top", offset: 8 }}
              >
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run()
                  }
                  className={
                    editor.isActive("heading", { level: 1 }) ? "active" : ""
                  }
                  title="Heading 1"
                >
                  <Heading1 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run()
                  }
                  className={
                    editor.isActive("heading", { level: 2 }) ? "active" : ""
                  }
                  title="Heading 2"
                >
                  <Heading2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run()
                  }
                  className={
                    editor.isActive("heading", { level: 3 }) ? "active" : ""
                  }
                  title="Heading 3"
                >
                  <Heading3 size={16} />
                </button>

                <div className="write-blog-bubble-divider" />

                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={editor.isActive("bold") ? "active" : ""}
                  title="Bold"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={editor.isActive("italic") ? "active" : ""}
                  title="Italic"
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={editor.isActive("underline") ? "active" : ""}
                  title="Underline"
                >
                  <UnderlineIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={editor.isActive("strike") ? "active" : ""}
                  title="Strikethrough"
                >
                  <Strikethrough size={16} />
                </button>

                <div className="write-blog-bubble-divider" />

                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  className={editor.isActive("bulletList") ? "active" : ""}
                  title="Bullet List"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  className={editor.isActive("orderedList") ? "active" : ""}
                  title="Numbered List"
                >
                  <ListOrdered size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  className={editor.isActive("blockquote") ? "active" : ""}
                  title="Quote"
                >
                  <Quote size={16} />
                </button>

                <div className="write-blog-bubble-divider" />

                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("left").run()
                  }
                  className={
                    editor.isActive({ textAlign: "left" }) ? "active" : ""
                  }
                  title="Align Left"
                >
                  <AlignLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("center").run()
                  }
                  className={
                    editor.isActive({ textAlign: "center" }) ? "active" : ""
                  }
                  title="Align Center"
                >
                  <AlignCenter size={16} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().setTextAlign("right").run()
                  }
                  className={
                    editor.isActive({ textAlign: "right" }) ? "active" : ""
                  }
                  title="Align Right"
                >
                  <AlignRight size={16} />
                </button>

                <div className="write-blog-bubble-divider" />

                <button
                  type="button"
                  onClick={addEditorLink}
                  className={editor.isActive("link") ? "active" : ""}
                  title="Add Link"
                >
                  <LinkIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={addEditorImage}
                  title="Add Image"
                >
                  <ImageIcon size={16} />
                </button>
              </BubbleMenu>
            )}

            <div className="write-blog-editor-body">
              <EditorContent editor={editor} />
            </div>
          </div>
        </section>

        {/* Categories & Tags */}
        <div className="write-blog-meta-grid">
          <section className="wb-section">
            <span className="wb-label">
              Categories <span className="wb-required">*</span>
            </span>
            <div className="write-blog-pills">
              {PREDEFINED_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`write-blog-pill ${selectedCategories.includes(cat) ? "active" : ""}`}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </section>

          <section className="wb-section">
            <span className="wb-label">
              Tags <span className="wb-required">*</span>
            </span>
            <div className="write-blog-pills">
              {PREDEFINED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`write-blog-pill ${selectedTags.includes(tag) ? "active" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Reading time */}
        <div className="write-blog-reading-time">
          <Clock size={14} /> Est. reading time · {readingTime} min
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {editingStatus !== "pending_review" && (
            <button
              className="write-blog-ghost-btn"
              onClick={handleSaveDraft}
              disabled={isPending}
            >
              {savingDraft ? "Saving…" : "Save as draft"}
            </button>
          )}
          <button
            className="write-blog-submit-btn"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending && !savingDraft
              ? "Submitting..."
              : editingStatus === "pending_review"
                ? "Save Changes"
                : "Submit for Review"}
          </button>
        </div>
      </div>

      {/* Email-required modal (only shown when the author has no email yet) */}
      {showEmailModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEmail) {
              setShowEmailModal(false);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 440,
              width: "100%",
              padding: 28,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <h2 className="text-xl font-semibold text-[var(--blog-dark)] mb-2">
              Add your email
            </h2>
            <p className="text-sm text-[var(--blog-muted)] mb-5">
              We&apos;ll use this to let you know when your blog is approved or
              if it isn&apos;t accepted. An email is required to submit for
              review.
            </p>
            <input
              type="email"
              autoFocus
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (emailError) setEmailError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !savingEmail) handleEmailContinue();
              }}
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid var(--blog-border)",
                borderRadius: 10,
                fontSize: 15,
                outline: "none",
                color: "var(--blog-dark)",
                background: "var(--blog-bg)",
              }}
            />
            {emailError && (
              <p className="text-sm text-red-600 mt-2">{emailError}</p>
            )}
            <div className="flex gap-3 justify-end mt-6">
              <button
                className="px-5 py-2.5 rounded-full border border-[var(--blog-border)] bg-transparent text-[var(--blog-dark)] font-medium hover:bg-[var(--blog-bg-alt)] transition-colors disabled:opacity-50"
                onClick={() => setShowEmailModal(false)}
                disabled={savingEmail}
              >
                Cancel
              </button>
              <button
                className="write-blog-submit-btn"
                onClick={handleEmailContinue}
                disabled={savingEmail}
              >
                {savingEmail ? "Saving..." : "Save & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
