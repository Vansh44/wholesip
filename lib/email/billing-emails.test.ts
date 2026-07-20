import { describe, it, expect } from "vitest";
import {
  planActivatedTemplate,
  paymentReceiptTemplate,
  paymentFailedTemplate,
  subscriptionCancelledTemplate,
  planDowngradedTemplate,
} from "./billing-emails";

const MANAGE = "https://echos.storemink.com/dashboard/plans";

describe("billing email templates", () => {
  it("plan activated — includes plan, price, renewal", () => {
    const e = planActivatedTemplate({
      storeName: "Echos",
      planName: "Basic",
      amountInr: 500,
      period: "monthly",
      renewsOn: "2026-08-12T00:00:00.000Z",
      manageUrl: MANAGE,
    });
    expect(e.subject).toContain("Basic");
    expect(e.html).toContain("₹500");
    expect(e.html).toContain("month");
    expect(e.html).toContain("12 Aug 2026");
    expect(e.html).toContain(MANAGE);
  });

  it("payment receipt — shows the charged amount", () => {
    const e = paymentReceiptTemplate({
      storeName: "Echos",
      planName: "Pro",
      amountInr: 1500,
      period: "monthly",
      renewsOn: null,
      manageUrl: MANAGE,
    });
    expect(e.subject).toMatch(/payment received/i);
    expect(e.html).toContain("₹1,500");
  });

  it("payment failed — retry vs final wording differ", () => {
    const retry = paymentFailedTemplate({
      storeName: "Echos",
      planName: "Basic",
      final: false,
      accessUntil: null,
      manageUrl: MANAGE,
    });
    const final = paymentFailedTemplate({
      storeName: "Echos",
      planName: "Basic",
      final: true,
      accessUntil: "2026-08-15T00:00:00.000Z",
      manageUrl: MANAGE,
    });
    expect(retry.html).toMatch(/retry/i);
    expect(final.subject).toMatch(/action needed/i);
    expect(final.html).toContain("15 Aug 2026");
  });

  it("cancellation — mentions access-until + re-subscribe", () => {
    const e = subscriptionCancelledTemplate({
      storeName: "Echos",
      planName: "Pro",
      accessUntil: "2026-09-01T00:00:00.000Z",
      manageUrl: MANAGE,
    });
    expect(e.subject).toMatch(/cancelled/i);
    // en-GB short month for September is "Sept" in modern ICU.
    expect(e.html).toMatch(/0?1 Sept? 2026/);
    expect(e.html).toMatch(/re-subscribe/i);
  });

  it("downgrade — reassures data is safe", () => {
    const e = planDowngradedTemplate({
      storeName: "Echos",
      fromPlanName: "Basic",
      manageUrl: MANAGE,
    });
    expect(e.subject).toMatch(/free plan/i);
    expect(e.html).toMatch(/nothing was deleted/i);
  });

  it("escapes HTML in the store name", () => {
    const e = planActivatedTemplate({
      storeName: "<script>x</script>",
      planName: "Basic",
      amountInr: 500,
      period: "monthly",
      renewsOn: null,
      manageUrl: MANAGE,
    });
    expect(e.html).not.toContain("<script>x</script>");
    expect(e.html).toContain("&lt;script&gt;");
  });
});
