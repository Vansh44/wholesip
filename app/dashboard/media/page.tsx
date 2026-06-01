"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import Image from "next/image";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadedImage {
  id: string;
  url: string;
}

export default function MediaDashboardPage() {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleUploadSuccess = (url: string) => {
    if (!url) return;
    setUploadedImages((prev) => [{ id: crypto.randomUUID(), url }, ...prev]);
  };

  const copyToClipboard = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="w-full flex flex-col gap-12 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          Media Library
        </h1>
        <p className="text-sm text-secondary-foreground">
          Upload and manage files. All images are hosted securely on Supabase
          Storage.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Upload Column */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-semibold text-primary">
              Upload New Media
            </h2>
          </div>
          <ImageUpload
            onUploadSuccess={handleUploadSuccess}
            folder="dashboard-uploads"
          />
        </div>

        {/* Gallery Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">
              Recent Uploads
            </h2>
            <span className="text-xs text-muted-foreground">
              {uploadedImages.length} items
            </span>
          </div>

          {uploadedImages.length === 0 ? (
            <div className="w-full h-48 border border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground text-sm">
              No recent uploads.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {uploadedImages.map(({ id, url }, index) => (
                <div key={id} className="flex flex-col gap-3 group">
                  <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border/50 bg-muted/30">
                    <Image
                      src={url}
                      alt={`Uploaded media ${index + 1}`}
                      fill
                      className="object-contain"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={url}
                      className="flex-1 h-8 px-2 text-xs text-muted-foreground bg-muted/50 border-none rounded focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => copyToClipboard(url, id)}
                    >
                      {copiedId === id ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
