/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));
vi.mock("@/lib/store/brand", () => ({
  getStoreBrand: vi.fn(async () => ({
    name: "WholeSip",
    domain: "wholesip.com",
  })),
}));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
  WHOLESIP_STORE_ID: "a0000000-0000-4000-8000-000000000001",
}));
vi.mock("@/lib/supabase/storage-cleanup", () => ({
  deleteStorageUrls: vi.fn().mockResolvedValue(undefined),
  extractMediaUrlsFromHtml: vi.fn().mockReturnValue([]),
}));
vi.mock("@/lib/email/blog-notifications", () => ({
  sendBlogApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendBlogRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/settings/resolve", () => ({
  getStoreSettings: vi.fn(async () => ({
    "blogs.customerSubmissions": true,
    "blogs.requireApproval": true,
    "pages.customCode": true,
  })),
}));

import {
  createBlog,
  updateBlog,
  deleteBlog,
  publishBlog,
  unpublishBlog,
  submitCustomerBlog,
  approveCustomerBlog,
  rejectCustomerBlog,
  revertCustomerBlogToDraft,
  deleteCustomerBlog,
  bulkSetBlogStatus,
  bulkSetBlogFeatured,
  bulkDeleteBlogs,
} from "./blog-actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { getStoreSettings } from "@/lib/settings/resolve";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import {
  sendBlogApprovedEmail,
  sendBlogRejectedEmail,
} from "@/lib/email/blog-notifications";
import { makeChain, makeSupabase } from "./_test-helpers";

const blogForm = {
  title: "Hello",
  slug: "",
  excerpt: "x",
  content: "<p>body</p>",
  cover_image_url: "",
  author: "Tester",
  categories: ["Nutrition"],
  tags: ["Protein"],
  status: "draft" as const,
  featured: false,
  seo_title: "",
  seo_description: "",
  reading_time: 0,
};

const customerForm = {
  title: "My Post",
  excerpt: "",
  content: "<p>body</p>",
  cover_image_url: "",
  categories: ["Recipes"],
  tags: ["Indian Food"],
};

// blog-actions.ts is the largest action file — admin CRUD, the customer
// submission workflow, and the approve/reject email notifications.
describe("blog-actions", () => {
  let supabase: any;
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase({
      blogs: makeChain({ data: { id: "b1" }, error: null }),
      users: makeChain({
        data: { id: "user-1", first_name: "Ada", last_name: "Lovelace" },
        error: null,
      }),
      // The store's blog taxonomy — customer submissions are validated
      // against these per-store lists (blog_taxonomy.sql).
      blog_categories: makeChain(
        { data: null, error: null },
        { data: [{ id: "c1", name: "Recipes" }], error: null },
      ),
      blog_tags: makeChain(
        { data: null, error: null },
        { data: [{ id: "t1", name: "Indian Food" }], error: null },
      ),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    admin = makeSupabase({
      users: makeChain({
        data: { email: "ada@example.com", first_name: "Ada" },
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("bulk operations", () => {
    it("bulkSetBlogStatus rejects when not authorised", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const r = await bulkSetBlogStatus(["b1"], "published");
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("bulkSetBlogStatus rejects an empty selection", async () => {
      const r = await bulkSetBlogStatus([], "published");
      expect(r.error).toMatch(/nothing selected/i);
    });

    it("bulkSetBlogStatus publishes the selected ids", async () => {
      const r = await bulkSetBlogStatus(["b1", "b2"], "published");
      expect(r.success).toBe(true);
      const chain = supabase._tables.blogs;
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "published" }),
      );
      // published_at is set when publishing.
      expect(chain.update.mock.calls[0][0].published_at).toBeTruthy();
      expect(chain.in).toHaveBeenCalledWith("id", ["b1", "b2"]);
    });

    it("bulkSetBlogStatus clears published_at when unpublishing", async () => {
      await bulkSetBlogStatus(["b1"], "draft");
      const chain = supabase._tables.blogs;
      expect(chain.update.mock.calls[0][0]).toMatchObject({
        status: "draft",
        published_at: null,
      });
    });

    it("bulkSetBlogStatus surfaces a DB error", async () => {
      supabase._tables.blogs = makeChain(
        { data: null, error: null },
        { data: null, error: { message: "boom" } },
      );
      const r = await bulkSetBlogStatus(["b1"], "published");
      expect(r.error).toBe("boom");
    });

    it("bulkSetBlogFeatured updates the featured flag for the ids", async () => {
      const r = await bulkSetBlogFeatured(["b1", "b2"], true);
      expect(r.success).toBe(true);
      const chain = supabase._tables.blogs;
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ featured: true }),
      );
      expect(chain.in).toHaveBeenCalledWith("id", ["b1", "b2"]);
    });

    it("bulkDeleteBlogs deletes the ids and cleans up storage", async () => {
      const r = await bulkDeleteBlogs(["b1", "b2"]);
      expect(r.success).toBe(true);
      const chain = supabase._tables.blogs;
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.in).toHaveBeenCalledWith("id", ["b1", "b2"]);
      expect(deleteStorageUrls).toHaveBeenCalled();
    });

    it("bulkDeleteBlogs rejects when not authorised", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const r = await bulkDeleteBlogs(["b1"]);
      expect(r.error).toMatch(/not authenticated/i);
    });

    it("bulkDeleteBlogs surfaces a DB error", async () => {
      supabase._tables.blogs = makeChain(
        { data: null, error: null },
        { data: null, error: { message: "nope" } },
      );
      const r = await bulkDeleteBlogs(["b1"]);
      expect(r.error).toBe("nope");
    });
  });

  describe("createBlog", () => {
    // Auth gate.
    it("rejects when caller lacks blogs.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createBlog(blogForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Reading time is computed from the content's word count, max 1 min.
    it("computes reading_time from content", async () => {
      await createBlog({
        ...blogForm,
        content: "<p>" + "word ".repeat(400) + "</p>",
      });
      const insert = supabase._tables.blogs.insert.mock.calls[0][0];
      // 400 words at 200 wpm = 2.
      expect(insert.reading_time).toBe(2);
    });

    // Drafts get published_at = null; published rows get a timestamp.
    it("publishes immediately when status=published", async () => {
      await createBlog({ ...blogForm, status: "published" });
      const insert = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(insert.published_at).not.toBeNull();
    });

    // 23505 unique-violation on slug → retries with bumped slug (NOT shown
    // here because the mock returns success). We just verify the call
    // succeeds with the first available slug derived from the title.
    it("uses a slug derived from the title", async () => {
      await createBlog({ ...blogForm, title: "Hello World" });
      const insert = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(insert.slug).toBe("hello-world");
    });
  });

  describe("updateBlog", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateBlog("b1", blogForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Approving a customer submission via the editor (status flip
    // pending_review → published) triggers the "your blog is live" email.
    it("emails the author when promoting a customer submission to published", async () => {
      // Pre-fetch returns the customer submission's current state.
      supabase._tables.blogs = makeChain({
        data: {
          status: "pending_review",
          published_at: null,
          submitted_by: "cust-1",
          is_customer_submission: true,
          cover_image_url: null,
          content: null,
        },
        error: null,
      });
      await updateBlog("b1", { ...blogForm, status: "published" });
      expect(sendBlogApprovedEmail).toHaveBeenCalled();
    });

    // Updating a regular published post should NOT trigger the customer email.
    it("does not email when updating a non-customer submission", async () => {
      supabase._tables.blogs = makeChain({
        data: {
          status: "draft",
          published_at: null,
          submitted_by: null,
          is_customer_submission: false,
          cover_image_url: null,
          content: null,
        },
        error: null,
      });
      await updateBlog("b1", { ...blogForm, status: "published" });
      expect(sendBlogApprovedEmail).not.toHaveBeenCalled();
    });
  });

  describe("publishBlog / unpublishBlog", () => {
    it("publishBlog rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      expect((await publishBlog("b1")).error).toMatch(/not authenticated/i);
    });

    // Sets status + stamps published_at.
    it("publishBlog updates status and stamps published_at", async () => {
      await publishBlog("b1");
      const updateArg = supabase._tables.blogs.update.mock.calls[0][0];
      expect(updateArg.status).toBe("published");
      expect(updateArg.published_at).not.toBeNull();
    });

    // Clears published_at on unpublish.
    it("unpublishBlog clears published_at", async () => {
      await unpublishBlog("b1");
      const updateArg = supabase._tables.blogs.update.mock.calls[0][0];
      expect(updateArg.status).toBe("draft");
      expect(updateArg.published_at).toBeNull();
    });
  });

  describe("deleteBlog", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      expect((await deleteBlog("b1")).error).toMatch(/not authenticated/i);
    });

    // Happy path — the action deletes the row (storage cleanup is async and
    // best-effort).
    it("deletes the blog and returns success", async () => {
      const result = await deleteBlog("b1");
      expect(result.success).toBe(true);
      expect(supabase._tables.blogs.delete).toHaveBeenCalled();
    });
  });

  // submitCustomerBlog — the public-facing endpoint used by signed-in
  // users from /blogs/write. Inserts the row with status
  // pending_review, populated via the customer's profile name.
  describe("submitCustomerBlog", () => {
    // Anonymous visitors are blocked from this action.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await submitCustomerBlog(customerForm);
      expect(result.error).toMatch(/sign in/i);
    });

    // Without a users row the action stops — a signed-in admin can't
    // accidentally hit this endpoint.
    it("rejects when customer profile is missing", async () => {
      supabase._tables.users = makeChain({ data: null, error: null });
      const result = await submitCustomerBlog(customerForm);
      expect(result.error).toMatch(/profile/i);
    });

    // Title, content, categories, tags are all required by validation.
    it("requires a title", async () => {
      const result = await submitCustomerBlog({ ...customerForm, title: " " });
      expect(result.error).toMatch(/title/i);
    });

    it("requires content", async () => {
      const result = await submitCustomerBlog({
        ...customerForm,
        content: " ",
      });
      expect(result.error).toMatch(/content/i);
    });

    it("requires at least one category when the store has categories", async () => {
      const result = await submitCustomerBlog({
        ...customerForm,
        categories: [],
      });
      expect(result.error).toMatch(/category/i);
    });

    it("requires at least one tag when the store has tags", async () => {
      const result = await submitCustomerBlog({ ...customerForm, tags: [] });
      expect(result.error).toMatch(/tag/i);
    });

    // Client input is untrusted — names outside the store's taxonomy are
    // dropped, and if nothing valid remains the submission is rejected.
    it("rejects when every submitted category is unknown to the store", async () => {
      const result = await submitCustomerBlog({
        ...customerForm,
        categories: ["Made Up"],
      });
      expect(result.error).toMatch(/category/i);
      expect(supabase._tables.blogs.insert).not.toHaveBeenCalled();
    });

    it("drops unknown names but keeps valid ones", async () => {
      await submitCustomerBlog({
        ...customerForm,
        categories: ["Recipes", "Made Up"],
        tags: ["Indian Food", "Nope"],
      });
      const inserted = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(inserted.categories).toEqual(["Recipes"]);
      expect(inserted.tags).toEqual(["Indian Food"]);
    });

    // A store that has not defined any taxonomy doesn't block submissions on
    // the (hidden) pickers.
    it("allows empty categories/tags when the store defines none", async () => {
      supabase._tables.blog_categories = makeChain(
        { data: null, error: null },
        { data: [], error: null },
      );
      supabase._tables.blog_tags = makeChain(
        { data: null, error: null },
        { data: [], error: null },
      );
      const result = await submitCustomerBlog({
        ...customerForm,
        categories: [],
        tags: [],
      });
      expect(result.success).toBe(true);
      const inserted = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(inserted.categories).toEqual([]);
      expect(inserted.tags).toEqual([]);
    });

    // Happy path — inserts as pending_review with the user as submitter.
    it("inserts with status=pending_review and is_customer_submission=true", async () => {
      await submitCustomerBlog(customerForm);
      const inserted = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(inserted.status).toBe("pending_review");
      expect(inserted.is_customer_submission).toBe(true);
      expect(inserted.submitted_by).toBe("user-1");
      // Author name is composed from the customer's first + last name.
      expect(inserted.author).toBe("Ada Lovelace");
      // Approval flow ON (default): no service-role promotion happens.
      expect(admin._tables.blogs?.update ?? vi.fn()).not.toHaveBeenCalled();
    });

    // Store setting: submissions switched off → the action refuses outright.
    it("rejects when the store has customer submissions disabled", async () => {
      vi.mocked(getStoreSettings).mockResolvedValueOnce({
        "blogs.customerSubmissions": false,
        "blogs.requireApproval": true,
        "pages.customCode": true,
        "marketing.showAllCoupons": false,
        "inventory.simpleTrackDefault": false,
        "inventory.lowStockThreshold": 5,
      });
      const result = await submitCustomerBlog(customerForm);
      expect(result.error).toMatch(/disabled/i);
      expect(supabase._tables.blogs.insert).not.toHaveBeenCalled();
    });

    // Store setting: approval flow off → the pending insert is promoted to
    // published via the service-role client (RLS blocks customers from
    // inserting published rows directly).
    it("publishes immediately when the store does not require approval", async () => {
      vi.mocked(getStoreSettings).mockResolvedValueOnce({
        "blogs.customerSubmissions": true,
        "blogs.requireApproval": false,
        "pages.customCode": true,
        "marketing.showAllCoupons": false,
        "inventory.simpleTrackDefault": false,
        "inventory.lowStockThreshold": 5,
      });
      const result = await submitCustomerBlog(customerForm);
      expect(result.success).toBe(true);

      // Insert still goes in as pending_review (RLS-compatible)…
      const inserted = supabase._tables.blogs.insert.mock.calls[0][0];
      expect(inserted.status).toBe("pending_review");

      // …then the admin client flips it live.
      const promote = admin._tables.blogs.update.mock.calls[0][0];
      expect(promote.status).toBe("published");
      expect(promote.published_at).toBeTruthy();
    });
  });

  // approveCustomerBlog — admin-only. Flips pending_review → published and
  // emails the author.
  describe("approveCustomerBlog", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await approveCustomerBlog("b1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Email is best-effort — verify it's attempted on success.
    it("emails the author after approval", async () => {
      supabase._tables.blogs = makeChain({
        data: { title: "T", slug: "t", submitted_by: "cust-1" },
        error: null,
      });
      await approveCustomerBlog("b1");
      expect(sendBlogApprovedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ada@example.com",
          title: "T",
          slug: "t",
        }),
      );
    });
  });

  // rejectCustomerBlog — admin-only. Deletes the pending row and emails
  // the author with a rejection notice.
  describe("rejectCustomerBlog", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await rejectCustomerBlog("b1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Verify the rejection email path triggers when there's a submitter.
    it("emails the author after rejection", async () => {
      supabase._tables.blogs = makeChain({
        data: { title: "T", submitted_by: "cust-1" },
        error: null,
      });
      await rejectCustomerBlog("b1");
      expect(sendBlogRejectedEmail).toHaveBeenCalled();
    });
  });

  // revertCustomerBlogToDraft — the author moves their own submission back
  // out of the review queue.
  describe("revertCustomerBlogToDraft", () => {
    // Anonymous visitors blocked.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await revertCustomerBlogToDraft("b1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // When no row matches the ownership + status filter the action fails
    // loudly (better than silently doing nothing).
    it("returns error when no matching pending row exists", async () => {
      supabase._tables.blogs = makeChain({ data: [], error: null });
      const result = await revertCustomerBlogToDraft("b1");
      expect(result.error).toMatch(/couldn.?t move/i);
    });
  });

  // deleteCustomerBlog — author withdraws their own draft / pending row.
  describe("deleteCustomerBlog", () => {
    // Anonymous visitors blocked.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await deleteCustomerBlog("b1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // When no row is removed (e.g. it was already published or doesn't belong
    // to the caller) the action surfaces a friendly error.
    it("returns error when no row was removed", async () => {
      supabase._tables.blogs = makeChain({ data: [], error: null });
      const result = await deleteCustomerBlog("b1");
      expect(result.error).toMatch(/couldn.?t delete/i);
    });
  });
});
