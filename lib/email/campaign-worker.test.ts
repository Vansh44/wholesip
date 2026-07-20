/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeDbMock } from "@/app/actions/_test-helpers";

vi.mock("@/lib/email/coupon-campaign", () => ({
  mergeTokens: (t: string) => t,
  renderCouponEmail: () => "<html>",
}));
vi.mock("@/lib/store/brand", () => ({
  getStoreBrandById: vi.fn(async () => ({
    name: "WholeSip",
    domain: "wholesip.com",
  })),
}));

const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }));
vi.mock("resend", () => {
  class Resend {
    batch = { send: batchSend };
    constructor() {}
  }
  return { Resend };
});

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { processEmailQueue } from "./campaign-worker";

const campaign = {
  id: "camp1",
  subject: "Hi {{first_name}}",
  body: "B",
  code: "C",
  discount_label: "10% off",
  valid_until_label: null,
  store_id: "store-1",
};

// executeQueue: #1 requeue (ignored) → #2 claim_email_batch (the batch) →
// #3 claim again (empty, so the drain loop terminates).
// selectQueue: #1 = the email_campaigns lookup for the batch.
function wire(batch: Array<Record<string, unknown>>) {
  dbHolder.current = makeDbMock({
    selectQueue: [[campaign]],
    executeQueue: [[], batch, []],
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
    dbHolder.current = makeDbMock();
    const result = await processEmailQueue();
    expect(result).toEqual({
      processed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
    });
    expect(dbHolder.current.calls.execute).toHaveLength(0);
    expect(dbHolder.current.calls.select).toHaveLength(0);
  });

  it("sends a claimed batch, marks it sent, and reports counts", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_realkey");
    wire([
      { id: "r1", campaign_id: "camp1", email: "a@x.com", first_name: "Ada" },
      { id: "r2", campaign_id: "camp1", email: "b@x.com", first_name: "Bob" },
    ]);

    const result = await processEmailQueue();

    expect(batchSend).toHaveBeenCalledTimes(1);
    expect(batchSend.mock.calls[0][0]).toHaveLength(2);
    expect(result).toMatchObject({ processed: 2, sent: 2, failed: 0 });
    expect(result.remaining).toBe(0);
    // The attempted rows are marked sent.
    expect(dbHolder.current.calls.set).toContainEqual({ status: "sent" });
  });

  it("marks a batch failed when Resend errors", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_realkey");
    batchSend.mockResolvedValue({ data: null, error: { message: "nope" } });
    wire([
      { id: "r1", campaign_id: "camp1", email: "a@x.com", first_name: "Ada" },
    ]);

    const result = await processEmailQueue();

    expect(result).toMatchObject({ processed: 1, sent: 0, failed: 1 });
    expect(dbHolder.current.calls.set).toContainEqual({ status: "failed" });
  });
});
