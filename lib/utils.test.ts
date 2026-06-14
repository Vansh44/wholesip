import { describe, it, expect } from "vitest";
import { cn } from "./utils";

// cn() is the shared className helper used by every component in the app.
// It composes clsx (conditional joining) with tailwind-merge (conflict
// resolution), so these tests cover both behaviours.
describe("cn", () => {
  // Smoke test — three plain strings should join with single spaces.
  it("joins simple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  // Components often pass `condition && "class"`; falsy values must be dropped
  // rather than rendered as the string "false"/"undefined".
  it("filters falsy values", () => {
    expect(cn("a", null, undefined, false, "", "b")).toBe("a b");
  });

  // tailwind-merge resolves Tailwind utility conflicts so the last one wins.
  // Without it, `p-2 p-4` would render both and CSS source order decides.
  it("merges conflicting tailwind classes (last one wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  // clsx accepts `{ class: boolean }` objects — useful for variant props.
  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  // Arrays are flattened — needed when forwarding `className` props.
  it("handles arrays of class values", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c");
  });

  // Called with no args (e.g. cn(props.className) where className is undefined).
  it("returns an empty string when given nothing", () => {
    expect(cn()).toBe("");
  });
});
