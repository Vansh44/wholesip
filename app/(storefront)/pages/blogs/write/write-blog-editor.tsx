"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { PREDEFINED_CATEGORIES, PREDEFINED_TAGS } from "@/lib/blog-config";
import { uploadImage } from "@/lib/supabase/storage";
import {
  submitCustomerBlog,
  updateCustomerBlog,
  getMySubmissions,
} from "@/app/actions/blog-actions";
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
  Code,
  Minus,
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
} from "lucide-react";

type Mode = "write" | "edit" | "success" | "submissions";

export default function WriteBlogEditor() {
  const { user, customer, loading: authLoading, openAuthModal } = useAuth();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("write");
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Write your story..." }),
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
      setSubmissions(result.data.submissions as any[]);
    } else {
      toast.error(result.error || "Failed to load submissions");
    }
    setLoadingSubmissions(false);
  };

  const calculateReadingTime = (text: string) => {
    const wpm = 225;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / wpm);
  };

  const readingTime = editor ? calculateReadingTime(editor.getText()) : 0;

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
      const url = await uploadImage(file, { folder: "blog-covers" });
      setCoverImageUrl(url);
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

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error("Please enter a title for your blog");
      return;
    }

    if (!editor || editor.getText().trim().length < 50) {
      toast.error("Please write a bit more content before submitting");
      return;
    }

    startTransition(async () => {
      const formData = {
        title,
        excerpt,
        content: editor.getHTML(),
        cover_image_url: coverImageUrl,
        categories: selectedCategories,
        tags: selectedTags,
      };

      let result;
      if (mode === "edit" && editingBlogId) {
        result = await updateCustomerBlog(editingBlogId, formData);
      } else {
        result = await submitCustomerBlog(formData);
      }

      if (result.error) {
        toast.error(result.error);
      } else {
        setMode("success");
        // Reset form
        setTitle("");
        setExcerpt("");
        setCoverImageUrl("");
        setSelectedCategories([]);
        setSelectedTags([]);
        editor.commands.setContent("");
        setEditingBlogId(null);
      }
    });
  };

  const handleEditSubmission = (blog: any) => {
    setTitle(blog.title);
    setExcerpt(blog.excerpt || "");
    setCoverImageUrl(blog.cover_image_url || "");
    setSelectedCategories(blog.categories || []);
    setSelectedTags(blog.tags || []);
    if (editor) {
      editor.commands.setContent(blog.content || "");
    }
    setEditingBlogId(blog.id);
    setMode("edit");
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
          <Link href="/pages/blogs" className="write-blog-auth-back">
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
            <Link href="/pages/blogs" className="write-blog-submit-btn">
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
        <div className="max-w-[1000px] mx-auto py-12 px-6">
          <div className="flex justify-between items-center mb-8">
            <div>
              <Link
                href="/pages/blogs"
                className="flex items-center gap-2 text-[var(--blog-muted)] hover:text-[var(--blog-dark)] transition-colors mb-4 text-sm font-medium"
              >
                <ArrowLeft size={16} /> Back to Blogs
              </Link>
              <h1 className="text-3xl font-semibold text-[var(--blog-dark)]">
                My Submissions
              </h1>
            </div>
            <button
              className="write-blog-submit-btn"
              onClick={() => setMode("write")}
            >
              Write New Blog
            </button>
          </div>

          {loadingSubmissions ? (
            <div className="py-20 text-center text-[var(--blog-muted)]">
              Loading...
            </div>
          ) : submissions.length === 0 ? (
            <div className="write-blog-success p-12">
              <FileText
                size={48}
                className="text-[var(--blog-border)] mx-auto mb-4"
              />
              <h2 className="text-xl font-semibold mb-2">No submissions yet</h2>
              <p className="text-[var(--blog-muted)] mb-6 max-w-md mx-auto">
                You haven't submitted any blogs yet. Start writing to share your
                story!
              </p>
              <button
                className="write-blog-submit-btn"
                onClick={() => setMode("write")}
              >
                Write Your First Blog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {submissions.map((blog) => (
                <div key={blog.id} className="write-blog-submission-card">
                  {blog.cover_image_url ? (
                    <div className="h-40 overflow-hidden bg-[var(--blog-bg-alt)]">
                      <img
                        src={blog.cover_image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-40 bg-[var(--blog-bg-alt)] flex items-center justify-center text-[var(--blog-border)]">
                      <ImageIcon size={32} />
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`write-blog-status-badge ${blog.status === "published" ? "published" : "pending"}`}
                      >
                        {blog.status === "published"
                          ? "Published"
                          : "Pending Review"}
                      </span>
                      <span className="text-xs text-[var(--blog-muted)] flex items-center gap-1">
                        <Clock size={12} />{" "}
                        {new Date(blog.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="font-semibold text-[var(--blog-dark)] mb-2 line-clamp-2">
                      {blog.title}
                    </h3>
                    {blog.status === "pending_review" && (
                      <button
                        onClick={() => handleEditSubmission(blog)}
                        className="mt-4 text-sm font-medium text-[var(--blog-accent)] hover:text-[var(--blog-dark)] transition-colors flex items-center gap-1"
                      >
                        Edit Submission
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="write-blog-page">
      <div className="write-blog-header">
        <div className="flex flex-col gap-1">
          <Link
            href="/pages/blogs"
            className="flex items-center gap-2 text-[var(--blog-muted)] hover:text-[var(--blog-dark)] transition-colors text-sm font-medium mb-1"
          >
            <ArrowLeft size={16} /> Back to Blogs
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--blog-dark)]">
            {mode === "edit" ? "Edit Submission" : "Write Your Blog"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-5 py-2.5 rounded-full border border-[var(--blog-border)] bg-transparent text-[var(--blog-dark)] font-medium hover:bg-white transition-colors"
            onClick={() => setMode("submissions")}
          >
            My Submissions
          </button>
          <button
            className="write-blog-submit-btn"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending
              ? "Submitting..."
              : mode === "edit"
                ? "Save Changes"
                : "Submit for Review"}
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 pb-24">
        <div className="write-blog-layout">
          {/* Editor Area */}
          <div className="write-blog-editor-area">
            <input
              type="text"
              placeholder="Your blog title..."
              className="write-blog-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {editor && (
              <div className="write-blog-toolbar">
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
                  <Heading1 size={18} />
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
                  <Heading2 size={18} />
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
                  <Heading3 size={18} />
                </button>

                <div className="write-blog-toolbar-divider" />

                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={editor.isActive("bold") ? "active" : ""}
                  title="Bold"
                >
                  <Bold size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={editor.isActive("italic") ? "active" : ""}
                  title="Italic"
                >
                  <Italic size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={editor.isActive("underline") ? "active" : ""}
                  title="Underline"
                >
                  <UnderlineIcon size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  className={editor.isActive("strike") ? "active" : ""}
                  title="Strikethrough"
                >
                  <Strikethrough size={18} />
                </button>

                <div className="write-blog-toolbar-divider" />

                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleBulletList().run()
                  }
                  className={editor.isActive("bulletList") ? "active" : ""}
                  title="Bullet List"
                >
                  <List size={18} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleOrderedList().run()
                  }
                  className={editor.isActive("orderedList") ? "active" : ""}
                  title="Numbered List"
                >
                  <ListOrdered size={18} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editor.chain().focus().toggleBlockquote().run()
                  }
                  className={editor.isActive("blockquote") ? "active" : ""}
                  title="Quote"
                >
                  <Quote size={18} />
                </button>

                <div className="write-blog-toolbar-divider" />

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
                  <AlignLeft size={18} />
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
                  <AlignCenter size={18} />
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
                  <AlignRight size={18} />
                </button>

                <div className="write-blog-toolbar-divider" />

                <button
                  type="button"
                  onClick={addEditorLink}
                  title="Add Link"
                  className={editor.isActive("link") ? "active" : ""}
                >
                  <LinkIcon size={18} />
                </button>
                <button
                  type="button"
                  onClick={addEditorImage}
                  title="Add Image"
                >
                  <ImageIcon size={18} />
                </button>
              </div>
            )}

            <div className="p-6 md:p-10">
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Settings Sidebar */}
          <div className="write-blog-sidebar">
            <div className="write-blog-sidebar-card">
              <h3 className="write-blog-sidebar-title">Cover Image</h3>
              {coverImageUrl ? (
                <div className="write-blog-cover-preview">
                  <img src={coverImageUrl} alt="Cover" />
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
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={24} className="mb-2 text-[var(--blog-muted)]" />
                  <p className="text-sm font-medium text-[var(--blog-dark)]">
                    Click to upload cover
                  </p>
                  <p className="text-xs text-[var(--blog-muted)] mt-1">
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
            </div>

            <div className="write-blog-sidebar-card">
              <h3 className="write-blog-sidebar-title">Excerpt</h3>
              <textarea
                className="write-blog-textarea"
                placeholder="A brief summary of your post..."
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                maxLength={200}
                rows={3}
              />
              <div className="text-right text-xs text-[var(--blog-muted)] mt-1">
                {excerpt.length}/200
              </div>
            </div>

            <div className="write-blog-sidebar-card">
              <h3 className="write-blog-sidebar-title">Categories</h3>
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
            </div>

            <div className="write-blog-sidebar-card">
              <h3 className="write-blog-sidebar-title">Tags</h3>
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
            </div>

            <div className="write-blog-sidebar-card flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--blog-dark)]">
                Est. Reading Time
              </span>
              <span className="text-sm text-[var(--blog-muted)] bg-[var(--blog-bg)] px-3 py-1 rounded-full">
                {readingTime} min
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
