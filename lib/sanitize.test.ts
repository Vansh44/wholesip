import { describe, it, expect } from "vitest";
import { sanitizeBlogContent } from "./sanitize";

// sanitizeBlogContent() runs on BOTH the write path (server actions persisting
// blog HTML) and the render path (before dangerouslySetInnerHTML). These tests
// pin down what's allowed and — more importantly — what's blocked.
describe("sanitizeBlogContent", () => {
  // Helper must never throw on nullish input; render path passes raw db values.
  it("returns empty string for null / undefined / empty", () => {
    expect(sanitizeBlogContent(null)).toBe("");
    expect(sanitizeBlogContent(undefined)).toBe("");
    expect(sanitizeBlogContent("")).toBe("");
  });

  // Primary XSS attack — embedded <script> tags must be removed entirely
  // (not just escaped) so they don't run on render.
  it("strips <script> tags entirely", () => {
    const dirty = `<p>hi</p><script>alert(1)</script>`;
    const clean = sanitizeBlogContent(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("alert(1)");
    expect(clean).toContain("<p>hi</p>");
  });

  // Inline event handlers (onclick, onerror, ...) are JS execution vectors.
  it("removes inline event handlers", () => {
    const out = sanitizeBlogContent(
      `<a href="https://x.com" onclick="evil()">x</a>`,
    );
    expect(out).not.toContain("onclick");
  });

  // `javascript:` URLs are the classic anchor-based XSS — must be dropped.
  it("blocks javascript: URLs on links", () => {
    const out = sanitizeBlogContent(`<a href="javascript:alert(1)">click</a>`);
    expect(out).not.toContain("javascript:");
  });

  // The everyday case — legitimate http/https/mailto links survive intact.
  it("allows http/https/mailto on anchors", () => {
    expect(sanitizeBlogContent(`<a href="https://x.com">x</a>`)).toContain(
      'href="https://x.com"',
    );
    expect(sanitizeBlogContent(`<a href="mailto:a@b.com">e</a>`)).toContain(
      "mailto:a@b.com",
    );
  });

  // Images uploaded through the editor need to render — verifies the explicit
  // <img> whitelist isn't accidentally stripped.
  it("allows img tags with safe src", () => {
    const out = sanitizeBlogContent(
      `<img src="https://cdn.example.com/x.png" alt="x" />`,
    );
    expect(out).toContain("<img");
    expect(out).toContain("https://cdn.example.com/x.png");
  });

  // data: URLs are dangerous on anchors (XSS) but safe on images (used for
  // pasted screenshots). The config narrows the scheme allowlist per-tag.
  it("permits data: URLs only on images", () => {
    const img = sanitizeBlogContent(`<img src="data:image/png;base64,AAA" />`);
    expect(img).toContain("data:image/png");

    const link = sanitizeBlogContent(`<a href="data:text/html,evil">x</a>`);
    expect(link).not.toContain("data:");
  });

  // The Tiptap editor emits h1–h4; these are explicitly added to the
  // base whitelist and should survive.
  it("preserves whitelisted heading tags h1-h4", () => {
    const out = sanitizeBlogContent(`<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4>`);
    expect(out).toContain("<h1>a</h1>");
    expect(out).toContain("<h2>b</h2>");
    expect(out).toContain("<h3>c</h3>");
    expect(out).toContain("<h4>d</h4>");
  });

  // <u> and <s> come from the editor toolbar — also custom-allowed.
  it("preserves <u> and <s> tags from the editor", () => {
    const out = sanitizeBlogContent(`<p><u>under</u><s>strike</s></p>`);
    expect(out).toContain("<u>under</u>");
    expect(out).toContain("<s>strike</s>");
  });

  // text-align is one of the few whitelisted CSS properties — needed for the
  // editor's alignment toolbar to round-trip.
  it("keeps whitelisted style properties (text-align)", () => {
    const out = sanitizeBlogContent(
      `<p style="text-align:center">centered</p>`,
    );
    expect(out).toContain("text-align");
    expect(out).toContain("center");
  });

  // Arbitrary CSS is a clickjacking vector (position:fixed overlays). Only the
  // whitelisted properties survive; everything else must be stripped.
  it("drops style properties that aren't whitelisted", () => {
    const out = sanitizeBlogContent(`<p style="position:fixed;top:0">x</p>`);
    expect(out).not.toContain("position");
    expect(out).not.toContain("fixed");
  });

  // <iframe> embeds are not in the allowlist — they could host malicious (pages).
  it("drops iframe and embed tags", () => {
    const out = sanitizeBlogContent(
      `<p>hi</p><iframe src="https://evil.com"></iframe>`,
    );
    expect(out).not.toContain("<iframe");
  });
});
