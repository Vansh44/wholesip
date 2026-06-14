import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

// slugify() generates the URL slug preview shown in editors. It mirrors the
// server-side slugify so the editor shows exactly what will be persisted
// (the server still owns uniqueness — it appends -2, -3, ... on collisions).
describe("slugify", () => {
  // Slugs are always lowercase + hyphens; verifies the basic happy path.
  it("lowercases the input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  // Multiple consecutive spaces should collapse into a single hyphen, not
  // produce empty segments like `a--b`.
  it("collapses spaces into a single hyphen", () => {
    expect(slugify("a   b   c")).toBe("a-b-c");
  });

  // Underscores are treated as separators so `my_post` → `my-post`.
  it("converts underscores into hyphens", () => {
    expect(slugify("hello_world_foo")).toBe("hello-world-foo");
  });

  // Punctuation must be stripped before the space-to-hyphen step, otherwise
  // `Foo, Bar` would leak the comma into the slug.
  it("strips non-word characters except hyphen", () => {
    expect(slugify("Foo, Bar! & Baz?")).toBe("foo-bar-baz");
  });

  // Leading/trailing hyphens are ugly in URLs; verify they're trimmed.
  it("trims leading and trailing hyphens", () => {
    expect(slugify("---hi---")).toBe("hi");
  });

  // Whitespace around the input shouldn't survive into the slug.
  it("trims surrounding whitespace", () => {
    expect(slugify("  spaced  ")).toBe("spaced");
  });

  // Defensive edge case — empty input must not throw.
  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  // Digits are word characters and must be kept (matters for "Top 10").
  it("preserves digits", () => {
    expect(slugify("Top 10 Picks")).toBe("top-10-picks");
  });

  // All-punctuation titles collapse to empty (the server then falls back to a
  // safe default like "role").
  it("handles strings of only punctuation", () => {
    expect(slugify("!!!???")).toBe("");
  });
});
