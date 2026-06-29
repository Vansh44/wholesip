import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
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
// sendCouponEmail now enqueues and fires the worker via `after()`. Mock both so
// no real background request goes out during tests.
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/email/trigger-worker", () => ({
  triggerEmailWorker: vi.fn(),
}));

// getResend() still constructs a Resend client to verify config is present.
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

// A supabase mock wired for the enqueue path: a users table (audience
// resolution) plus the two campaign tables.
function makeEnqueueSupabase(
  usersData: Array<Record<string, unknown>>,
  opts: {
    campaign?: { data: unknown; error: unknown };
    recipientsInsert?: { error: unknown };
  } = {},
) {
  return makeSupabase({
    users: makeChain(undefined, { data: usersData, error: null }),
    email_campaigns: makeChain(
      opts.campaign ?? { data: { id: "camp1" }, error: null },
      { error: null },
    ),
    email_campaign_recipients: makeChain(
      undefined,
      opts.recipientsInsert ?? { error: null },
    ),
  });
}

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

// listEmailRecipients — server-side searched, capped page + emailable total.
describe("listEmailRecipients", () => {
  it("rejects unauthenticated callers", async () => {
    vi.mocked(getManagerUserId).mockResolvedValue(null);
    const result = await listEmailRecipients();
    expect(result.error).toMatch(/not authenticated/i);
    expect(result.customers).toEqual([]);
  });

  it("returns a friendly error on DB failure", async () => {
    const supabase = makeSupabase({
      users: makeChain(undefined, {
        data: null,
        count: null,
        error: { message: "boom" },
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await listEmailRecipients();
    expect(result.error).toMatch(/could not load customers/i);
    expect(result.customers).toEqual([]);
  });

  it("maps rows into RecipientOptions and returns the emailable total", async () => {
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
          {
            id: "c2",
            first_name: null,
            last_name: null,
            email: null,
            phone: null,
          },
        ],
        count: 7,
        error: null,
      }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await listEmailRecipients();
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(7);
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

  it("passes the search term to an .or() filter", async () => {
    const usersChain = makeChain(undefined, {
      data: [],
      count: 0,
      error: null,
    });
    const supabase = makeSupabase({ users: usersChain });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    await listEmailRecipients("ada");
    expect(usersChain.or).toHaveBeenCalledTimes(1);
    expect(usersChain.or.mock.calls[0][0]).toContain("ada");
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
});

// sendCouponEmail — resolve audience, then ENQUEUE a campaign + recipient rows
// for background delivery (the worker does the actual sending).
describe("sendCouponEmail (enqueue)", () => {
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
  });

  it("errors when RESEND_API_KEY is a placeholder", async () => {
    vi.stubEnv("RESEND_API_KEY", "placeholder-key");
    const result = await sendCouponEmail(sendInput);
    expect(result.error).toMatch(/isn.?t configured/i);
  });

  it("queues all customers (mode: all)", async () => {
    const supabase = makeEnqueueSupabase([
      { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
      { id: "b", first_name: "Bob", email: "bob@x.com", phone: "2" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.error).toBeUndefined();
    expect(result.queued).toBe(2);
    expect(result.skippedNoEmail).toBe(0);
    expect(supabase._tables.email_campaigns.insert).toHaveBeenCalledTimes(1);
    expect(
      supabase._tables.email_campaign_recipients.insert,
    ).toHaveBeenCalledTimes(1);
    const rows = supabase._tables.email_campaign_recipients.insert.mock
      .calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ campaign_id: "camp1", email: "ada@x.com" });
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
      email_campaigns: makeChain(
        { data: { id: "camp1" }, error: null },
        {
          error: null,
        },
      ),
      email_campaign_recipients: makeChain(undefined, { error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "group", groupId: "g1" },
    });
    expect(result.queued).toBe(2);
    expect(supabase._tables.user_group_members.eq).toHaveBeenCalledWith(
      "group_id",
      "g1",
    );
    expect(supabase._tables.users.in).toHaveBeenCalledWith("id", ["a", "b"]);
  });

  it("returns no-email error for an empty group (nothing enqueued)", async () => {
    const supabase = makeSupabase({
      user_group_members: makeChain(undefined, { data: [], error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "group", groupId: "g1" },
    });
    expect(result.queued).toBe(0);
    expect(result.error).toMatch(/none of the selected customers/i);
  });

  it("resolves specific customers (mode: specific)", async () => {
    const supabase = makeEnqueueSupabase([
      { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "specific", customerIds: ["a"] },
    });
    expect(result.queued).toBe(1);
    expect(supabase._tables.users.in).toHaveBeenCalledWith("id", ["a"]);
  });

  it("returns no-email error for empty specific list", async () => {
    const supabase = makeSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "specific", customerIds: [] },
    });
    expect(result.queued).toBe(0);
    expect(result.error).toMatch(/none of the selected customers/i);
  });

  it("counts recipients with no email as skipped", async () => {
    const supabase = makeEnqueueSupabase([
      { id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" },
      { id: "b", first_name: "Bob", email: null, phone: "2" },
      { id: "c", first_name: "Cy", email: null, phone: "3" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.queued).toBe(1);
    expect(result.skippedNoEmail).toBe(2);
  });

  it("errors (and enqueues nothing) when nobody has an email", async () => {
    const supabase = makeEnqueueSupabase([
      { id: "b", first_name: "Bob", email: null, phone: "2" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.queued).toBe(0);
    expect(result.skippedNoEmail).toBe(1);
    expect(result.error).toMatch(/none of the selected customers/i);
    expect(supabase._tables.email_campaigns.insert).not.toHaveBeenCalled();
  });

  it("errors when the campaign row can't be created", async () => {
    const supabase = makeEnqueueSupabase(
      [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
      { campaign: { data: null, error: { message: "no table" } } },
    );
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.error).toMatch(/could not queue the campaign/i);
  });

  it("errors when recipient rows can't be enqueued", async () => {
    const supabase = makeEnqueueSupabase(
      [{ id: "a", first_name: "Ada", email: "ada@x.com", phone: "1" }],
      { recipientsInsert: { error: { message: "boom" } } },
    );
    vi.mocked(createAdminClient).mockReturnValue(supabase);
    const result = await sendCouponEmail({
      ...sendInput,
      audience: { mode: "all" },
    });
    expect(result.error).toMatch(/could not queue all recipients/i);
  });
});
