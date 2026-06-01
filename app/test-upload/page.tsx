"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import Image from "next/image";

export default function TestUploadPage() {
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 font-sans">
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-sm border border-border">
        <h1 className="text-xl font-semibold text-primary mb-2">
          Test Supabase Upload
        </h1>
        <p className="text-sm text-secondary-foreground mb-8">
          Upload an image here. It will be sent directly to your Supabase
          `media` bucket.
        </p>

        <ImageUpload
          onUploadSuccess={(url) => setUploadedImageUrl(url)}
          folder="test-uploads"
        />

        {uploadedImageUrl && (
          <div className="mt-8 p-4 bg-slate-50 border border-border rounded-lg">
            <h2 className="text-sm font-semibold text-success mb-2">
              Upload Successful!
            </h2>
            <p className="text-xs text-muted-foreground break-all mb-4">
              <strong>Public URL:</strong> {uploadedImageUrl}
            </p>

            <p className="text-xs font-medium text-primary mb-2">
              Rendered using Next.js &lt;Image&gt;:
            </p>
            <div className="relative w-full h-40 rounded overflow-hidden border border-border/50">
              <Image
                src={uploadedImageUrl}
                alt="Uploaded test image"
                fill
                className="object-cover"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
