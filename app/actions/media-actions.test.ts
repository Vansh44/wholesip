/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => STORE),
}));
vi.mock("@/lib/storage/gcs", () => ({
  gcsConfigured: true,
  gcsUploadObject: vi.fn(
    async (path: string) => `https://storage.googleapis.com/bucket/${path}`,
  ),
  gcsPathFromUrl: vi.fn((url: string) => url.split("/bucket/")[1] ?? null),
  gcsDeletePaths: vi.fn(async () => {}),
}));
vi.mock("@/lib/storage/process-image", () => ({
  processImageUpload: vi.fn(async () => ({
    ok: true,
    data: {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/webp",
      ext: "webp",
    },
  })),
}));

const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withUser: vi.fn((_i: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { uploadMediaAsset, deleteMediaAsset } from "./media-actions";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { gcsUploadObject, gcsDeletePaths } from "@/lib/storage/gcs";
import { mediaAssets } from "@/drizzle/schema";

const STORE = "a0000000-0000-4000-8000-000000000001";

function withFile() {
  const fd = new FormData();
  fd.append("file", new File(["x"], "photo.png", { type: "image/png" }));
  return fd;
}

// media-actions.ts — the media library upload (GCS + media_assets row, orphan
// cleanup on DB failure) and delete (store-scoped row + GCS object).
describe("media-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock({
      returning: [{ id: "m1", url: "u", path: "p", filename: "photo.png" }],
    });
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("uploadMediaAsset", () => {
    it("rejects when the caller lacks media access (nothing uploaded)", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await uploadMediaAsset(withFile());
      expect(res.error).toBeTruthy();
      expect(vi.mocked(gcsUploadObject)).not.toHaveBeenCalled();
    });

    it("uploads under a store-scoped path and records a media_assets row", async () => {
      const res = await uploadMediaAsset(withFile());
      expect(res.error).toBeUndefined();
      expect(res.asset?.id).toBe("m1");
      // GCS object path is scoped to the acting store.
      const path = vi.mocked(gcsUploadObject).mock.calls[0][0];
      expect(path).toContain(`stores/${STORE}/media/`);
      // A row was inserted into media_assets.
      expect(dbHolder.current.calls.insert[0]).toBe(mediaAssets);
    });

    it("removes the orphaned object when the DB insert fails", async () => {
      dbHolder.current = makeDbMock({ failInsertFor: [mediaAssets] });
      const res = await uploadMediaAsset(withFile());
      expect(res.error).toBeTruthy();
      // The object we just uploaded is cleaned up (no orphan left in the bucket).
      const uploadedPath = vi.mocked(gcsUploadObject).mock.results[0]
        .value as Promise<string>;
      await expect(uploadedPath).resolves.toContain(`stores/${STORE}/media/`);
      expect(vi.mocked(gcsDeletePaths)).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteMediaAsset", () => {
    it("rejects an unauthorised caller", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const res = await deleteMediaAsset("m1");
      expect(res.error).toBeTruthy();
    });

    it("deletes the store-scoped row AND the GCS object", async () => {
      dbHolder.current = makeDbMock({
        selectQueue: [[{ path: "stores/x/media/f.webp", url: "u" }]],
      });
      const res = await deleteMediaAsset("m1");
      expect(res.success).toBe(true);
      expect(dbHolder.current.calls.delete[0]).toBe(mediaAssets);
      // The bucket object is removed too, using the stored path.
      expect(vi.mocked(gcsDeletePaths)).toHaveBeenCalledWith([
        "stores/x/media/f.webp",
      ]);
    });

    it("returns a friendly error when the item no longer exists", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[]] });
      const res = await deleteMediaAsset("missing");
      expect(res.error).toMatch(/no longer exists/i);
      expect(vi.mocked(gcsDeletePaths)).not.toHaveBeenCalled();
    });
  });
});
