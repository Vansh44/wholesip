"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

/**
 * Copy-link + native-share buttons, reused on the blog detail and product
 * pages. Styled via .soakd-share* in storefront-theme.css (global). Share uses
 * the Web Share API when available (mobile / supporting browsers) and falls
 * back to copying the link.
 */
export function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const currentUrl = () =>
    typeof window === "undefined" ? "" : window.location.href;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked (e.g. insecure context) — no-op.
    }
  };

  const share = async () => {
    const url = currentUrl();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed — fall back to copy.
      }
    }
    copy();
  };

  return (
    <div className="soakd-share">
      <button
        type="button"
        className="soakd-share-btn"
        onClick={copy}
        aria-label="Copy link"
      >
        {copied ? <Check size={16} /> : <Link2 size={16} />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        className="soakd-share-btn"
        onClick={share}
        aria-label="Share"
      >
        <Share2 size={16} />
        Share
      </button>
    </div>
  );
}
