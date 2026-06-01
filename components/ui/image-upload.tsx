"use client";

import { useState, useRef } from "react";
import { uploadImage } from "@/lib/supabase/storage";
import { UploadCloud, Loader2, X, Check } from "lucide-react";
import { Button } from "./button";

interface ImageUploadProps {
  onUploadSuccess: (url: string) => void;
  folder?: string;
  defaultImage?: string;
  className?: string;
}

export function ImageUpload({
  onUploadSuccess,
  folder = "",
  defaultImage,
  className = "",
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    defaultImage || null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndStage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB.");
      return;
    }
    setError(null);
    setPendingFile(file);
    setPendingPreview(URL.createObjectURL(file));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndStage(file);
  };

  const handleConfirm = async () => {
    if (!pendingFile || !pendingPreview) return;
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadImage(pendingFile, { folder });
      setPreviewUrl(uploadedUrl);
      onUploadSuccess(uploadedUrl);
      setPendingFile(null);
      setPendingPreview(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to upload image. Please try again.";
      setError(message);
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

  const handleRemoveUploaded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    onUploadSuccess("");
  };

  const triggerFileInput = () => {
    if (!pendingPreview) fileInputRef.current?.click();
  };

  // — Preview modal (pending confirmation) —
  if (pendingPreview) {
    return (
      <div className={`w-full ${className}`}>
        <div className="relative w-full rounded-lg border border-border overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingPreview}
            alt="Preview"
            className="w-full h-48 object-contain bg-muted/30"
          />
          <div className="absolute bottom-0 inset-x-0 bg-background/90 border-t border-border px-3 py-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground truncate">
              {pendingFile?.name}
            </p>
            <div className="flex items-center gap-2 shrink-0">
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
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // — Uploaded state —
  if (previewUrl) {
    return (
      <div className={`w-full ${className}`}>
        <div className="relative w-full h-48 rounded-lg border border-border/50 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Uploaded"
            className="w-full h-full object-cover"
          />
          <button
            onClick={handleRemoveUploaded}
            type="button"
            className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-md rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // — Empty / idle state —
  return (
    <div className={`w-full ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
      />
      <div
        onClick={triggerFileInput}
        className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors
          ${error ? "border-destructive/50 bg-destructive/5" : "border-border hover:bg-muted/50"}`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
          <UploadCloud className="w-8 h-8 mb-3" />
          <p className="mb-1 text-sm font-medium">
            <span className="text-primary">Click to upload</span> or drag and
            drop
          </p>
          <p className="text-xs">PNG, JPG, WEBP (MAX. 5MB)</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
