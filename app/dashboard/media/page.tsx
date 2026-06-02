"use client";

import { useState } from "react";
import { ImageUpload } from "@/components/ui/image-upload";
import Image from "next/image";
import { Check, Copy } from "lucide-react";

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
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>Media Library</h1>
          <p>All uploaded images and files</p>
        </div>
        <button type="button" className="dash-btn dash-btn-primary shrink-0">
          ⬆ Upload
        </button>
      </header>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <div className="dash-card lg:col-span-1">
          <div className="dash-card-header">
            <div className="dash-card-title">Upload New Media</div>
          </div>
          <div className="dash-card-body">
            <ImageUpload
              onUploadSuccess={handleUploadSuccess}
              folder="dashboard-uploads"
            />
          </div>
        </div>

        <div className="dash-card lg:col-span-2">
          <div className="dash-card-header">
            <div className="dash-card-title">Recent Uploads</div>
            <span className="text-[12px] text-[var(--dash-text-3)]">
              {uploadedImages.length} items
            </span>
          </div>
          <div className="dash-card-body">
            {uploadedImages.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-[var(--dash-radius-sm)] border border-dashed border-[var(--dash-border)] text-sm text-[var(--dash-text-3)]">
                No recent uploads.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {uploadedImages.map(({ id, url }, index) => (
                  <div key={id} className="flex flex-col gap-2">
                    <div className="relative aspect-video overflow-hidden rounded-[var(--dash-radius-sm)] border border-[var(--dash-border)] bg-[var(--dash-surface-2)]">
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
                        className="dash-input h-8 flex-1 px-2 text-xs"
                      />
                      <button
                        type="button"
                        className="dash-btn dash-btn-ghost flex h-8 w-8 shrink-0 items-center justify-center p-0"
                        onClick={() => copyToClipboard(url, id)}
                      >
                        {copiedId === id ? (
                          <Check className="h-3.5 w-3.5 text-[var(--dash-green)]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
