"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  UploadCloud,
  Copy,
  Check,
  Trash2,
  X,
  ImageIcon,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListPagination } from "@/app/dashboard/components/list-pagination";
import {
  uploadMediaAsset,
  deleteMediaAsset,
  type MediaAsset,
} from "@/app/actions/media-actions";

const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  assets: MediaAsset[];
  total: number;
  page: number;
  pageSize: number;
};

export function MediaLibraryView({ assets, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [pending, startAction] = useTransition();
  const [navigating, startNav] = useTransition();

  const [viewing, setViewing] = useState<MediaAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Release the object URL backing the staged preview.
  useEffect(() => {
    return () => {
      if (stagedPreview) URL.revokeObjectURL(stagedPreview);
    };
  }, [stagedPreview]);

  function stage(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setStagedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setStaged(file);
  }

  function clearStaged() {
    setStaged(null);
    setStagedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function confirmUpload() {
    if (!staged) return;
    const fd = new FormData();
    fd.append("file", staged);
    startUpload(async () => {
      const res = await uploadMediaAsset(fd);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Uploaded to your library");
      clearStaged();
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startAction(async () => {
      const res = await deleteMediaAsset(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Deleted");
      setDeleteTarget(null);
      setViewing((v) => (v?.id === id ? null : v));
      router.refresh();
    });
  }

  async function copyUrl(asset: MediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((c) => (c === asset.id ? null : c)), 1800);
      toast.success("URL copied");
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  }

  const goToPage = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    startNav(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  };

  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Media Library</h1>
          <p>All images uploaded for this store</p>
        </div>
        <button
          type="button"
          className="dash-btn dash-btn-primary shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
      </header>

      {/* Hidden input drives both the header button and the dropzone. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) stage(f);
        }}
      />

      {/* Upload / confirm-before-upload zone */}
      <div className="dash-card mb-3.5">
        <div className="dash-card-body">
          {staged && stagedPreview ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative h-40 w-full shrink-0 overflow-hidden rounded-[var(--dash-radius-sm)] border border-[var(--dash-border)] bg-[var(--dash-surface-2)] sm:w-56">
                {/* Local blob preview — next/image can't take a blob: URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stagedPreview}
                  alt="Preview"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[var(--dash-text)]">
                  {staged.name}
                </div>
                <div className="text-[12px] text-[var(--dash-text-3)]">
                  {formatSize(staged.size)} · optimized to WebP on upload
                </div>
                <p className="mt-1 text-[12px] text-[var(--dash-text-3)]">
                  Upload this image to your library?
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={confirmUpload}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {uploading ? "Uploading…" : "Upload"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearStaged}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) stage(f);
              }}
              className={`flex h-40 cursor-pointer flex-col items-center justify-center rounded-[var(--dash-radius-sm)] border-2 border-dashed text-center transition-colors ${
                dragOver
                  ? "border-[var(--dash-accent)] bg-[var(--dash-accent)]/5"
                  : "border-[var(--dash-border)] hover:bg-[var(--dash-surface-2)]"
              }`}
            >
              <UploadCloud className="mb-2 h-7 w-7 text-[var(--dash-text-3)]" />
              <p className="text-[13px] font-medium text-[var(--dash-text)]">
                <span className="text-[var(--dash-accent)]">
                  Click to upload
                </span>{" "}
                or drag and drop
              </p>
              <p className="text-[12px] text-[var(--dash-text-3)]">
                PNG, JPG, WEBP, SVG, GIF (max 5 MB)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Library grid */}
      <div className="dash-card flex flex-col" style={{ flex: "1 1 auto" }}>
        <div className="dash-card-header">
          <div className="dash-card-title">Library</div>
          <span className="text-[12px] text-[var(--dash-text-3)]">
            {total} {total === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="dash-card-body">
          {assets.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-[var(--dash-radius-sm)] border border-dashed border-[var(--dash-border)] text-[var(--dash-text-3)]">
              <ImageIcon className="h-6 w-6" />
              <span className="text-sm">
                No media yet. Upload your first image above.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative overflow-hidden rounded-[var(--dash-radius-sm)] border border-[var(--dash-border)] bg-[var(--dash-surface-2)]"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(asset)}
                    className="relative block aspect-square w-full"
                    title={asset.filename || "View"}
                  >
                    <Image
                      src={asset.url}
                      alt={asset.filename || "Media"}
                      fill
                      sizes="(max-width:640px) 50vw,(max-width:1024px) 33vw,200px"
                      className="object-cover"
                    />
                  </button>
                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyUrl(asset)}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur hover:bg-black/70"
                      title="Copy URL"
                    >
                      {copiedId === asset.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(asset)}
                      className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md bg-black/55 text-white backdrop-blur hover:bg-[var(--dash-red)]"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <ListPagination
          page={page}
          total={total}
          pageSize={pageSize}
          busy={navigating}
          onPage={goToPage}
        />
      </div>

      {/* View modal */}
      <Dialog
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">
              {viewing?.filename || "Media"}
            </DialogTitle>
            <DialogDescription>
              {viewing
                ? `${formatSize(viewing.size_bytes)} · ${viewing.content_type || "image"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <>
              <div className="relative flex max-h-[50vh] min-h-[220px] items-center justify-center overflow-hidden rounded-[var(--dash-radius-sm)] border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
                <Image
                  src={viewing.url}
                  alt={viewing.filename || "Media"}
                  width={1200}
                  height={800}
                  className="max-h-[50vh] w-auto object-contain"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={viewing.url}
                  className="dash-input h-9 flex-1 px-2 text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => copyUrl(viewing)}
                >
                  {copiedId === viewing.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy
                </Button>
              </div>
            </>
          )}
          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => viewing && window.open(viewing.url, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => viewing && setDeleteTarget(viewing)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !pending && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete this image?</DialogTitle>
            <DialogDescription>
              This permanently removes &ldquo;
              {deleteTarget?.filename || "the image"}
              &rdquo; from your library and from storage. Anything still linking
              to its URL will break. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
