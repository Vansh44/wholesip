import { describe, it, expect } from "vitest";
import { BLOG_REACTIONS } from "./blog-reactions";

// BLOG_REACTIONS is the single source of truth for which emoji reactions the
// floating blog reaction bar offers, and in what order they render. The order
// and exact set are load-bearing — localStorage keys and the DB count columns
// are keyed off these strings.
describe("BLOG_REACTIONS", () => {
  // Exactly the five supported reactions, in the order they appear in the bar.
  it("contains exactly the five expected keys in order", () => {
    expect([...BLOG_REACTIONS]).toEqual([
      "like",
      "love",
      "haha",
      "wow",
      "celebrate",
    ]);
  });

  // Length guard so an accidental addition/removal is caught.
  it("has exactly five entries", () => {
    expect(BLOG_REACTIONS).toHaveLength(5);
  });
});
