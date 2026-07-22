"use client";

import { useState, useRef } from "react";
import { uploadVideo } from "@/lib/storage/uploads";
import { UploadCloud, Loader2, X, Check, Film } from "lucide-react";
import { Button } from "./button";

interface VideoUploadProps {
  onUploadSuccess: (url: string) => void;
  folder?: string;
  defaultVideo?: string;
  className?: string;
}

// Video counterpart of ImageUpload: pick → inline preview → confirm → upload
// (signed-URL flow, straight to storage — see lib/storage/uploads.ts).
export function VideoUpload({
  onUploadSuccess,
  folder = "",
  defaultVideo,
  className = "",
}: VideoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(defaultVideo || null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndStage = (file: File) => {
    if (!file.type.startsWith("video/")) {
      setError("Please select a video file (MP4 or WebM).");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Video must be smaller than 50MB.");
      return;
    }
    setError(null);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleConfirm = async () => {
    if (!pendingFile) return;
    setIsUploading(true);
    try {
      const url = await uploadVideo(pendingFile, { folder });
      setVideoUrl(url);
      onUploadSuccess(url);
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
      setPendingFile(null);
      setPendingPreview(null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to upload the video.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCancel = () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingFile(null);
    setPendingPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (pendingPreview) {
    return (
      <div className={`w-full ${className}`}>
        <div className="border-border bg-muted/30 relative h-48 w-full overflow-hidden rounded-lg border">
          <video
            src={pendingPreview}
            className="absolute inset-0 h-full w-full object-contain"
            muted
            playsInline
            controls
          />
          <div className="bg-background/90 border-border absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t px-3 py-2">
            <p className="text-muted-foreground truncate text-xs">
              {pendingFile?.name}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isUploading}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirm}
                disabled={isUploading}
                className="gap-1.5"
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {isUploading ? "Uploading…" : "OK, upload"}
              </Button>
            </div>
          </div>
        </div>
        {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
      </div>
    );
  }

  if (videoUrl) {
    return (
      <div className={`w-full ${className}`}>
        <div className="border-border/50 bg-muted/30 relative h-48 w-full overflow-hidden rounded-lg border">
          <video
            src={videoUrl}
            className="absolute inset-0 h-full w-full object-contain"
            muted
            playsInline
            controls
          />
          <button
            onClick={() => {
              setVideoUrl(null);
              onUploadSuccess("");
            }}
            type="button"
            className="bg-background/80 hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 rounded-md p-1.5 shadow-sm backdrop-blur-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) validateAndStage(file);
        }}
        accept="video/mp4, video/webm, video/quicktime"
        className="hidden"
      />
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${error ? "border-destructive/50 bg-destructive/5" : "border-border hover:bg-muted/50"}`}
      >
        <div className="text-muted-foreground flex flex-col items-center justify-center pt-4 pb-5">
          <span className="mb-2 flex items-center gap-2">
            <Film className="h-6 w-6" />
            <UploadCloud className="h-6 w-6" />
          </span>
          <p className="mb-1 text-sm font-medium">
            <span className="text-primary">Click to upload a video</span>
          </p>
          <p className="text-xs">MP4, WEBM (MAX. 50MB)</p>
        </div>
      </div>
      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
    </div>
  );
}
