import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  mergeTokens,
  renderCouponEmail,
  renderCouponEmailBody,
  type CouponEmailContent,
} from "./coupon-campaign";

// escapeHtml() is the guard that runs on every AI/hand-written value before it
// is interpolated into email HTML — it's the only thing standing between a
// malicious body and an injected <script> in someone's inbox.
describe("escapeHtml", () => {
  // Each of the five HTML-significant characters must be entity-encoded.
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml("&")).toBe("&amp;");
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml(">")).toBe("&gt;");
    expect(escapeHtml('"')).toBe("&quot;");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  // Ampersand MUST be replaced first, otherwise the &lt; / &amp; entities it
  // emits for the other chars would themselves get double-escaped.
  it("escapes ampersand first so entities aren't double-escaped", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("a & b < c")).toBe("a &amp; b &lt; c");
    // The literal text "&lt;" must survive as a visible &amp;lt;, proving the
    // & got handled before any < would have produced a fresh entity.
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  // A full attack string round-trips into harmless escaped text.
  it("neutralises a script tag", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  // Plain text with none of the special characters is returned unchanged.
  it("leaves safe text unchanged", () => {
    expect(escapeHtml("Hello there, friend 123")).toBe(
      "Hello there, friend 123",
    );
    expect(escapeHtml("")).toBe("");
  });
});

// mergeTokens() resolves the per-recipient {{first_name}} / {{name}} merge tag.
describe("mergeTokens", () => {
  // The canonical tag, plus the {{name}} alias, both resolve.
  it("replaces {{first_name}} and {{name}}", () => {
    expect(mergeTokens("Hi {{first_name}}!", "Ada")).toBe("Hi Ada!");
    expect(mergeTokens("Hi {{name}}!", "Ada")).toBe("Hi Ada!");
  });

  // Whitespace inside the braces is tolerated (copy-paste / formatting slips).
  it("tolerates whitespace inside the braces", () => {
    expect(mergeTokens("Hi {{ first_name }}!", "Ada")).toBe("Hi Ada!");
    expect(mergeTokens("Hi {{  name  }}!", "Ada")).toBe("Hi Ada!");
  });

  // The token match is case-insensitive.
  it("matches the token case-insensitively", () => {
    expect(mergeTokens("Hi {{FIRST_NAME}}", "Ada")).toBe("Hi Ada");
    expect(mergeTokens("Hi {{First_Name}}", "Ada")).toBe("Hi Ada");
    expect(mergeTokens("Hi {{Name}}", "Ada")).toBe("Hi Ada");
  });

  // Empty / whitespace-only names fall back to the friendly "there" default so
  // nobody gets a "Hi !" greeting.
  it("falls back to 'there' for empty / whitespace first names", () => {
    expect(mergeTokens("Hi {{first_name}}", "")).toBe("Hi there");
    expect(mergeTokens("Hi {{first_name}}", "   ")).toBe("Hi there");
  });

  // A real name is trimmed of surrounding whitespace.
  it("trims surrounding whitespace from the name", () => {
    expect(mergeTokens("Hi {{first_name}}", "  Ada  ")).toBe("Hi Ada");
  });

  // Every occurrence in the string is replaced (global flag), not just the first.
  it("replaces every occurrence", () => {
    expect(mergeTokens("{{first_name}} {{name}} {{first_name}}", "Ada")).toBe(
      "Ada Ada Ada",
    );
  });

  // Text with no token at all is returned untouched.
  it("leaves text with no token unchanged", () => {
    expect(mergeTokens("No tokens here", "Ada")).toBe("No tokens here");
    // A non-matching token name is left as-is.
    expect(mergeTokens("Hi {{last_name}}", "Ada")).toBe("Hi {{last_name}}");
  });
});

// Base content used by the render tests; spread + override per case.
const base: CouponEmailContent = {
  body: "Hi {{first_name}},\n\nEnjoy your gift.",
  firstName: "Ada",
  code: "SAVE20",
  discountLabel: "20% OFF",
  validUntilLabel: "31 Dec 2026",
};

// renderCouponEmailBody() builds the inner HTML: escaped + merged paragraphs,
// the promo box, and the sign-off — before any outer wrapper.
describe("renderCouponEmailBody", () => {
  // The headline security property: markup in the body is escaped, never raw.
  it("escapes injected markup in the body", () => {
    const out = renderCouponEmailBody({
      ...base,
      body: "<script>alert(1)</script>",
    });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  // The merge tag is resolved inside the rendered body.
  it("merges the recipient's first name", () => {
    const out = renderCouponEmailBody(base);
    expect(out).toContain("Hi Ada,");
  });

  // Blank-line-separated blocks become separate <p> paragraphs.
  it("splits blank-line-separated blocks into separate paragraphs", () => {
    const out = renderCouponEmailBody({
      ...base,
      body: "First para.\n\nSecond para.",
    });
    const paraCount = (out.match(/margin:0 0 16px;">/g) || []).length;
    expect(paraCount).toBe(2);
    expect(out).toContain("First para.");
    expect(out).toContain("Second para.");
  });

  // A single newline inside a paragraph becomes a <br />, not a new <p>.
  it("turns a single newline into a <br />", () => {
    const out = renderCouponEmailBody({
      ...base,
      body: "Line one\nLine two",
    });
    expect(out).toContain("Line one<br />Line two");
    // Still a single paragraph block.
    const paraCount = (out.match(/margin:0 0 16px;">/g) || []).length;
    expect(paraCount).toBe(1);
  });

  // The coupon code and discount label appear (HTML-escaped) in the promo box.
  it("includes the escaped coupon code and discount label", () => {
    const out = renderCouponEmailBody({
      ...base,
      code: "A&B<20>",
      discountLabel: "Save <50%>",
    });
    expect(out).toContain("A&amp;B&lt;20&gt;");
    expect(out).toContain("Save &lt;50%&gt;");
  });

  // The "valid until" block is present (escaped) when a label is provided.
  it("includes the valid-until block when provided", () => {
    const out = renderCouponEmailBody(base);
    expect(out).toContain("Valid until 31 Dec 2026");
  });

  // ...and is omitted entirely when null or undefined.
  it("omits the valid-until block when null or undefined", () => {
    expect(
      renderCouponEmailBody({ ...base, validUntilLabel: null }),
    ).not.toContain("Valid until");
    expect(
      renderCouponEmailBody({ ...base, validUntilLabel: undefined }),
    ).not.toContain("Valid until");
  });

  // The brand sign-off is always present.
  it("includes the Team Soakd sign-off", () => {
    expect(renderCouponEmailBody(base)).toContain("Team Soakd");
  });
});

// renderCouponEmail() wraps the body in the shared branded HTML document
// (wrapBrandedEmail runs for real — it's pure string building).
describe("renderCouponEmail", () => {
  // Produces a full HTML document and still contains the inner body content.
  it("wraps the body in a full HTML document", () => {
    const out = renderCouponEmail(base);
    expect(out).toContain("<!DOCTYPE html>");
    expect(out).toContain("Team Soakd");
    expect(out).toContain("Hi Ada,");
    expect(out).toContain("SAVE20");
  });

  // The escaping guarantee survives wrapping — no raw script reaches the doc.
  it("keeps injected markup escaped in the wrapped document", () => {
    const out = renderCouponEmail({
      ...base,
      body: "<script>alert(1)</script>",
    });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
