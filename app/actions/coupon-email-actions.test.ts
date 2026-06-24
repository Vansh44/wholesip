import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
}));
vi.mock("@/lib/ai/gemini", () => ({
  callGemini: vi.fn(),
  loadBrandSoul: vi.fn(),
  brandSystemText: vi.fn((b: string) => `SYSTEM:${b}`),
}));
vi.mock("@/lib/email/coupon-campaign", () => ({
  mergeTokens: vi.fn((t: string) => t),
  renderCouponEmail: vi.fn(() => "<html>"),
}));

// Resend uses `new Resend(apiKey)` then `resend.batch.send(chunk)`.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }));
vi.mock("resend", () => {
  class Resend {
    batch = { send: batchSend };
    constructor() {}
  }
  return { Resend };
});

import {
  listEmailRecipients,
  generateCouponEmail,
  renderCouponEmailPreview,
  sendCouponEmail,
} from "./coupon-email-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { callGemini, loadBrandSoul } from "@/lib/ai/gemini";
import { mergeTokens, renderCouponEmail } from "@/lib/email/coupon-campaign";
import { makeChain, makeSupabase } from "./_test-helpers";

const genInput = {
  code: "SAVE10",
  description: "Ten off",
  discountLabel: "10% off",
  validUntilLabel: "Dec 31",
  audienceLabel: "VIP shoppers",
  instructions: "be cheerful",
};

const previewInput = {
  subject: "Hi {{first_name}}",
  body: "Body copy",
  code: "SAVE10",
  discountLabel: "10% off",
  validUntilLabel: "Dec 31",
};

const sendInput = {
  subject: "Hi {{first_name}}",
  body: "Body copy",
  code: "SAVE10",
  discountLabel: "10% off",
  validUntilLabel: "Dec 31",
  audience: { mode: "all" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  vi.mocked(loadBrandSoul).mockResolvedValue("brand soul");
  vi.mocked(callGemini).mockResolvedValue({
    text: JSON.stringify({ subject: "S", body: "B" }),
  });
  vi.mocked(mergeTokens).mockImplementation((t: string) => t);
  vi.mocked(renderCouponEmail).mockReturnValue("<html>");
  batchSend.mockResolvedValue({ data: { data: [{ id: "1" }] }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// listEmailRecipients — loads all storefront customers via the admin client.
describe("listEmailRecipients", () => {
  it("rejects unauthenticated callers", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const result = await listEmailRecipients();
    expect(result.error).toMatch(/not authenticated/i);
    expect(result.customers).toEqual([]);
  });

  it("returns a friendly error on DB failure", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, { data: null, error: { message: "boom" } }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await listEmailRecipients();
    expect(result.error).toMatch(/could not load customers/i);
    expect(result.customers).toEqual([]);
  });

  it("maps rows into RecipientOptions with fallbacks", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [
          {
            id: "c1",
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@x.com",
            phone: "+1",
          },
          // missing optional fields → fall back to "" / null
          { id: "c2", first_name: null, last_name: null, email: null, phone: null },
        ],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await listEmailRecipients();
    expect(result.error).toBeUndefined();
    expect(result.customers).toEqual([
      {
        id: "c1",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@x.com",
        phone: "+1",
      },
      { id: "c2", first_name: "", last_name: null, email: null, phone: "" },
    ]);
  });
});

// generateCouponEmail — AI-generated subject/body JSON from the brand soul.
describe("generateCouponEmail", () => {
  it("rejects unauthenticated callers", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const result = await generateCouponEmail(genInput);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("errors when the brand soul is missing", async () => {
    vi.mocked(loadBrandSoul).mockResolvedValue(null);
    const result = await generateCouponEmail(genInput);
    expect(result.error).toMatch(/brand\.md is missing/i);
  });

  it("surfaces a callGemini error", async () => {
    vi.mocked(callGemini).mockResolvedValue({ error: "AI busy" });
    const result = await generateCouponEmail(genInput);
    expect(result.error).toBe("AI busy");
  });

  it("errors when the AI response is not valid JSON", async () => {
    vi.mocked(callGemini).mockResolvedValue({ text: "not json {{{" });
    const result = await generateCouponEmail(genInput);
    expect(result.error).toMatch(/could not parse/i);
  });

  it("errors when the JSON is incomplete (missing body)", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ subject: "Hi" }),
    });
    const result = await generateCouponEmail(genInput);
    expect(result.error).toMatch(/incomplete/i);
  });

  it("errors when the JSON is incomplete (missing subject)", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ body: "Body" }),
    });
    const result = await generateCouponEmail(genInput);
    expect(result.error).toMatch(/incomplete/i);
  });

  it("returns the trimmed subject + body on success", async () => {
    vi.mocked(callGemini).mockResolvedValue({
      text: JSON.stringify({ subject: "  Sub  ", body: "  Bod  " }),
    });
    const result = await generateCouponEmail(genInput);
    expect(result.subject).toBe("Sub");
    expect(result.body).toBe("Bod");
    expect(result.error).toBeUndefined();
  });
});

// renderCouponEmailPreview — branded HTML for one sample recipient.
describe("renderCouponEmailPreview", () => {
  it("rejects unauthenticated callers", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const result = await renderCouponEmailPreview(previewInput);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("renders HTML and merges the subject with the sample name", async () => {
    const result = await renderCouponEmailPreview({
      ...previewInput,
      sampleName: "Ada",
    });
    expect(result.html).toBe("<html>");
    expect(renderCouponEmail).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Ada", body: "Body copy" }),
    );
    expect(mergeTokens).toHaveBeenCalledWith("Hi {{first_name}}", "Ada");
  });

  it("falls back to 'there' when no sample name is given", async () => {
    await renderCouponEmailPreview(previewInput);
    expect(renderCouponEmail).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "there" }),
    );
    expect(mergeTokens).toHaveBeenCalledWith("Hi {{first_name}}", "there");
  });
});

// sendCouponEmail — resolve audience, merge, batch-send via Resend.
describe("sendCouponEmail", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_realkey");
  });

  it("rejects unauthenticated callers", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const result = await sendCouponEmail(sendInput);
    expect(result.error).toMatch(/not authenticated/i);
  });

  it("rejects an empty subject", async () => {
    const result = await sendCouponEmail({ ...sendInput, subject: "   " });
    expect(result.error).toMatch(/subject and body/i);
  });

  it("rejects an empty body", async () => {
    const result = await sendCouponEmail({ ...sendInput, body: "   " });
    expect(result.error).toMatch(/subject and body/i);
  });

  it("errors when RESEND_API_KEY is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await sendCouponEmail(sendInput);
    expect(result.error).toMatch(/isn.?t configured/i);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("errors when RESEND_API_KEY is a placeholder", async () => {
    vi.stubEnv("RESEND_API_KEY", "placeholder-key");
    const result = await sendCouponEmail(sendInput);
    expect(result.error).toMatch(/isn.?t configured/i);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("sends to all customers (mode: all)", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [
          { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
          { id: "b", first_name: "Bob", email: "bob@x.com", phone: "2" },
        ],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockResolvedValue({
      data: { data: [{ id: "1" }, { id: "2" }] },
      error: null,
    });
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.error).toBeUndefined();
    expect(result.sent).toBe(2);
    expect(result.skippedNoEmail).toBe(0);
    expect(batchSend).toHaveBeenCalledTimes(1);
  });

  it("resolves group members (mode: group)", async () => {
    const supabase = makeSupabase({
      user_group_members: makeChain(undefined, {
        data: [{ user_id: "a" }, { user_id: "b" }],
        error: null,
      }),
      users: makeChain(undefined, {
        data: [
          { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
          { id: "b", first_name: "Bob", email: "bob@x.com", phone: "2" },
        ],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockResolvedValue({
      data: { data: [{ id: "1" }, { id: "2" }] },
      error: null,
    });
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "group", groupId: "g1" },
    });
    expect(result.sent).toBe(2);
    expect(supabase._tables.user_group_members.eq).toHaveBeenCalledWith(
      "group_id",
      "g1",
    );
    expect(supabase._tables.users.in).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("returns no-email error for an empty group", async () => {
    const supabase = makeSupabase({
      user_group_members: makeChain(undefined, { data: [], error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "group", groupId: "g1" },
    });
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/none of the selected customers/i);
  });

  it("resolves specific customers (mode: specific)", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "specific", customerIds: ["a"] },
    });
    expect(result.sent).toBe(1);
    expect(supabase._tables.users.in).toHaveBeenCalledWith("id", ["a"]);
  });

  it("returns no-email error for empty specific list", async () => {
    const supabase = makeSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "specific", customerIds: [] },
    });
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/none of the selected customers/i);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("skips recipients with no email (skippedNoEmail count)", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [
          { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
          { id: "b", first_name: "Bob", email: null, phone: "2" },
          { id: "c", first_name: "Cy", email: null, phone: "3" },
        ],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockResolvedValue({ data: { data: [{ id: "1" }] }, error: null });
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.sent).toBe(1);
    expect(result.skippedNoEmail).toBe(2);
  });

  it("errors when nobody has an email", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [{ id: "b", first_name: "Bob", email: null, phone: "2" }],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.sent).toBe(0);
    expect(result.skippedNoEmail).toBe(1);
    expect(result.error).toMatch(/none of the selected customers/i);
    expect(batchSend).not.toHaveBeenCalled();
  });

  it("falls back to chunk length when batch returns no data array", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockResolvedValue({ data: null, error: null });
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.sent).toBe(1);
  });

  it("returns a sending-failed error when the batch errors", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockResolvedValue({ data: null, error: { message: "nope" } });
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/sending failed/i);
  });

  it("returns a sending-failed error when the batch throws", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    batchSend.mockRejectedValue(new Error("network"));
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.sent).toBe(0);
    expect(result.error).toMatch(/sending failed/i);
  });
});
