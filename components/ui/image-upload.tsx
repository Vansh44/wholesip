"use client";

import { useState, useRef } from "react";
import { uploadImage } from "@/lib/supabase/storage";
import { UploadCloud, Loader2, X, Image as ImageIcon } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5MB.");
      return;
    }

    setError(null);
    setIsUploading(true);

    // Create local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      // Upload to Supabase
      const uploadedUrl = await uploadImage(file, { folder });
      onUploadSuccess(uploadedUrl);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to upload image. Please try again.");
      setPreviewUrl(defaultImage || null); // Revert preview on failure
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the container click
    setPreviewUrl(null);
    onUploadSuccess(""); // Send empty string back to parent
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
        className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors overflow-hidden
          ${error ? "border-error/50 bg-error/5" : "border-border hover:bg-muted/50"}
          ${previewUrl ? "border-solid border-border/50" : ""}
        `}
      >
        {previewUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Preview"
              className={`w-full h-full object-cover ${isUploading ? "opacity-50 grayscale" : ""}`}
            />

            {isUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
              </div>
            ) : (
              <button
                onClick={removeImage}
                type="button"
                className="absolute top-2 right-2 p-1.5 bg-background/80 backdrop-blur-md rounded-md hover:bg-destructive hover:text-destructive-foreground transition-colors shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-muted-foreground">
            {isUploading ? (
              <>
                <Loader2 className="w-8 h-8 mb-3 text-primary animate-spin" />
                <p className="text-sm font-medium">Uploading image...</p>
              </>
            ) : (
              <>
                <UploadCloud className="w-8 h-8 mb-3" />
                <p className="mb-1 text-sm font-medium">
                  <span className="text-primary">Click to upload</span> or drag
                  and drop
                </p>
                <p className="text-xs">PNG, JPG, WEBP (MAX. 5MB)</p>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
