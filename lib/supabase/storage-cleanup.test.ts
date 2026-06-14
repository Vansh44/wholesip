/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./admin", () => ({ createAdminClient: vi.fn() }));

import {
  pathFromPublicUrl,
  extractMediaUrlsFromHtml,
  deleteStorageUrls,
} from "./storage-cleanup";
import { createAdminClient } from "./admin";

// storage-cleanup.ts — keeps Supabase Storage in sync with the DB. The two
// pure helpers are easy to test; deleteStorageUrls() is best-effort, so we
// verify it dedupes and never throws.
describe("pathFromPublicUrl", () => {
  // Strips off everything up to and including /object/public/media/, leaving
  // the in-bucket path.
  it("extracts the in-bucket path from a public URL", () => {
    expect(
      pathFromPublicUrl(
        "https://x.example.com/storage/v1/object/public/media/folder/img.png",
      ),
    ).toBe("folder/img.png");
  });

  // URLs that don't reference the media bucket return null so the caller
  // can skip them (e.g. an externally hosted image).
  it("returns null when the marker is not present", () => {
    expect(pathFromPublicUrl("https://cdn.other.com/img.png")).toBeNull();
  });
});

// extractMediaUrlsFromHtml — pulls every media-bucket image URL from a blog
// body so the storage cleanup can prune deletions and re-uploads.
describe("extractMediaUrlsFromHtml", () => {
  // Nullish input must not throw.
  it("returns [] for null / undefined / empty", () => {
    expect(extractMediaUrlsFromHtml(null)).toEqual([]);
    expect(extractMediaUrlsFromHtml(undefined)).toEqual([]);
    expect(extractMediaUrlsFromHtml("")).toEqual([]);
  });

  // Standard happy path: pull out multiple unique URLs.
  it("extracts unique media URLs from img tags", () => {
    const html = `
      <img src="https://x.example.com/storage/v1/object/public/media/a.png" />
      <img src="https://x.example.com/storage/v1/object/public/media/b.png" />
      <img src="https://x.example.com/storage/v1/object/public/media/a.png" />
    `;
    const urls = extractMediaUrlsFromHtml(html);
    expect(urls.sort()).toEqual([
      "https://x.example.com/storage/v1/object/public/media/a.png",
      "https://x.example.com/storage/v1/object/public/media/b.png",
    ]);
  });

  // External (non-media-bucket) image URLs are ignored — we only manage
  // our own storage.
  it("ignores URLs not in the media bucket", () => {
    const html = `<img src="https://cdn.other.com/img.png" />`;
    expect(extractMediaUrlsFromHtml(html)).toEqual([]);
  });
});

// deleteStorageUrls — best-effort batch removal via the service-role client.
describe("deleteStorageUrls", () => {
  const remove = vi.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminClient).mockReturnValue({
      storage: { from: () => ({ remove }) },
    } as any);
  });

  // No-op when there are no removable paths — never hits the storage API.
  it("does nothing when given empty / nullish urls", async () => {
    await deleteStorageUrls([null, undefined, ""]);
    expect(remove).not.toHaveBeenCalled();
  });

  // External URLs (with no media-bucket path) are filtered out before
  // hitting storage.
  it("filters out external URLs", async () => {
    await deleteStorageUrls(["https://cdn.other.com/x.png"]);
    expect(remove).not.toHaveBeenCalled();
  });

  // Duplicate URLs are deduped so storage.remove() gets each path once.
  it("dedupes paths before calling storage.remove", async () => {
    const url = "https://x.example.com/storage/v1/object/public/media/dup.png";
    await deleteStorageUrls([url, url, url]);
    expect(remove).toHaveBeenCalledWith(["dup.png"]);
  });

  // A thrown error inside remove() must NOT propagate — the surrounding
  // DB write must still succeed (storage cleanup is best-effort).
  it("never throws when storage.remove rejects", async () => {
    remove.mockRejectedValueOnce(new Error("network"));
    await expect(
      deleteStorageUrls([
        "https://x.example.com/storage/v1/object/public/media/x.png",
      ]),
    ).resolves.toBeUndefined();
  });
});
