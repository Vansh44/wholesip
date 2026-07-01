import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email/coupon-campaign", () => ({
  mergeTokens: (t: string) => t,
  renderCouponEmail: () => "<html>",
}));
vi.mock("@/lib/store/brand", () => ({
  getStoreBrandById: vi.fn(async () => ({ name: "WholeSip", domain: "wholesip.com" })),
}));

const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }));
vi.mock("resend", () => {
  class Resend {
    batch = { send: batchSend };
    constructor() {}
  }
  return { Resend };
});

import { processEmailQueue } from "./campaign-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeChain, makeSupabase } from "@/app/actions/_test-helpers";

const campaign = {
  id: "camp1",
  subject: "Hi {{first_name}}",
  body: "B",
  code: "C",
  discount_label: "10% off",
  valid_until_label: null,
  store_id: "store-1",
};

// Wire claim_email_batch to hand back `batch` once, then empty (so the drain
// loop terminates). Other RPCs (requeue) resolve to 0.
function withClaims(
  supabase: ReturnType<typeof makeSupabase>,
  batch: Array<Record<string, unknown>>,
) {
  let claims = 0;
  supabase.rpc.mockImplementation((name: string) => {
    if (name === "claim_email_batch") {
      claims++;
      return Promise.resolve({ data: claims === 1 ? batch : [], error: null });
    }
    return Promise.resolve({ data: 0, error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  batchSend.mockResolvedValue({ data: { data: [{ id: "1" }] }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("processEmailQueue", () => {
  it("does nothing (and touches no DB) when RESEND_API_KEY is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await processEmailQueue();
    expect(result).toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("sends a claimed batch, marks it sent, and reports counts", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_realkey");
    const supabase = makeSupabase({
      email_campaigns: makeChain(undefined, {
        data: [campaign],
        error: null,
      }),
      email_campaign_recipients: makeChain(undefined, {
        data: [],
        count: 0,
        error: null,
      }),
    });
    withClaims(supabase, [
      { id: "r1", campaign_id: "camp1", email: "a@x.com", first_name: "Ada" },
      { id: "r2", campaign_id: "camp1", email: "b@x.com", first_name: "Bob" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);

    const result = await processEmailQueue();

    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend.mock.calls[0][0]).toHaveLength(2);
    expect(result).toMatchObject({ processed: 2, sent: 2, failed: 0 });
    expect(result.remaining).toBe(0);
    expect(
      supabase._tables.email_campaign_recipients.update,
    ).toHaveBeenCalledWith({ status: "sent" });
  });

  it("marks a batch failed when Resend errors", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_realkey");
    batchSend.mockResolvedValue({ data: null, error: { message: "nope" } });
    const supabase = makeSupabase({
      email_campaigns: makeChain(undefined, {
        data: [campaign],
        error: null,
      }),
      email_campaign_recipients: makeChain(undefined, {
        data: [],
        count: 0,
        error: null,
      }),
    });
    withClaims(supabase, [
      { id: "r1", campaign_id: "camp1", email: "a@x.com", first_name: "Ada" },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(supabase);

    const result = await processEmailQueue();

    expect(result).toMatchObject({ processed: 1, sent: 0, failed: 1 });
    expect(
      supabase._tables.email_campaign_recipients.update,
    ).toHaveBeenCalledWith({ status: "failed" });
  });
});
