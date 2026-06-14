import { describe, it, expect } from "vitest";
import {
  can,
  normalizePermissions,
  getSection,
  roleBadgeClass,
  SECTIONS,
  ROLE_COLORS,
} from "./permissions";

// can() is the central RBAC predicate. Every server-action gate (via
// getManagerUserId) and every page guard funnels through this function, so
// these tests pin down the exact authorization rules.
describe("can", () => {
  // Escape hatch — superadmins bypass the permission map entirely.
  it("superadmin always passes", () => {
    expect(can({}, "anything", "manage", true)).toBe(true);
    expect(can(null, "anything", "view", true)).toBe(true);
  });

  // No permissions → no access. Defensive default.
  it("denies when no permissions map", () => {
    expect(can(null, "products", "view")).toBe(false);
    expect(can(undefined, "products", "view")).toBe(false);
  });

  // Holding permissions on one section grants nothing on another.
  it("denies when the section is missing", () => {
    expect(can({ products: ["view"] }, "blogs", "view")).toBe(false);
  });

  // Happy path — granted action allowed.
  it("allows the exact granted action", () => {
    expect(can({ products: ["view"] }, "products", "view")).toBe(true);
    expect(can({ products: ["manage"] }, "products", "manage")).toBe(true);
  });

  // 'manage' is the stronger right and implies the ability to view. This
  // matches the role editor UI where ticking 'manage' auto-ticks 'view'.
  it("manage implies view", () => {
    expect(can({ products: ["manage"] }, "products", "view")).toBe(true);
  });

  // The reverse must NOT hold — a viewer can't manage. Critical invariant.
  it("view does NOT imply manage", () => {
    expect(can({ products: ["view"] }, "products", "manage")).toBe(false);
  });

  // An entry present but empty (e.g. cleared in the editor) means no access.
  it("denies when the granted actions list is empty", () => {
    expect(can({ products: [] }, "products", "view")).toBe(false);
  });
});

// normalizePermissions() is the input sanitiser between the DB JSON and the
// runtime predicate. It enforces the schema: only known sections, only known
// actions, only non-empty action lists.
describe("normalizePermissions", () => {
  // Defensive against garbage from old DB rows or hand-edited JSON.
  it("returns {} for non-object input", () => {
    expect(normalizePermissions(null)).toEqual({});
    expect(normalizePermissions(undefined)).toEqual({});
    expect(normalizePermissions("nope")).toEqual({});
    expect(normalizePermissions(42)).toEqual({});
  });

  // Unknown actions ('delete') and unknown sections ('bogus') are dropped —
  // we never want a typo'd action to become an unintended grant.
  it("keeps only valid actions for known sections", () => {
    const result = normalizePermissions({
      products: ["view", "manage", "delete"], // 'delete' is not a real action
      bogus: ["view"], // not a real section
    });
    expect(result.products?.sort()).toEqual(["manage", "view"]);
    expect(result.bogus).toBeUndefined();
  });

  // If the only requested actions are invalid for the section, the section
  // is omitted entirely rather than left as an empty array.
  it("omits sections whose action list is empty after filtering", () => {
    const result = normalizePermissions({
      dashboard: ["delete"], // dashboard only supports 'view'
    });
    expect(result.dashboard).toBeUndefined();
  });

  // The schema says actions are arrays; a string instead is ignored.
  it("ignores non-array values", () => {
    const result = normalizePermissions({ products: "view" });
    expect(result.products).toBeUndefined();
  });
});

// getSection() is the section-catalog lookup used by the role editor UI.
describe("getSection", () => {
  // Happy path — known keys resolve to their config.
  it("returns the matching section by key", () => {
    expect(getSection("products")?.label).toBe("Products");
    expect(getSection("blogs")?.group).toBe("Content");
  });

  // Unknown keys must not crash callers; return undefined.
  it("returns undefined for an unknown key", () => {
    expect(getSection("nope")).toBeUndefined();
  });
});

// roleBadgeClass() maps a stored role color string to its CSS class. The
// badge appears next to every admin's name in the users table.
describe("roleBadgeClass", () => {
  // Verifies the mapping for both a normal color and the special 'violet'
  // which is the superadmin gold badge.
  it("returns the matching class for known colors", () => {
    expect(roleBadgeClass("blue")).toBe("dash-badge-blue");
    expect(roleBadgeClass("violet")).toBe("dash-role-super");
  });

  // Old or hand-edited rows might have unknown colors — fall back to grey
  // rather than rendering an undefined class.
  it("falls back to grey for unknown colors", () => {
    expect(roleBadgeClass("rainbow")).toBe("dash-badge-grey");
    expect(roleBadgeClass("")).toBe("dash-badge-grey");
  });
});

// Invariants on the SECTIONS catalog itself — these break if someone adds a
// duplicate or empty entry.
describe("SECTIONS catalog", () => {
  // Section keys are used as DB JSON keys in role.permissions — duplicates
  // would silently overwrite each other.
  it("has unique section keys", () => {
    const keys = SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A section with no actions can't ever be granted — likely a config bug.
  it("every section's actions are non-empty", () => {
    for (const s of SECTIONS) {
      expect(s.actions.length).toBeGreaterThan(0);
    }
  });

  // Sanity check the role-color palette stayed in sync with the badge map.
  it("ROLE_COLORS includes expected palette", () => {
    expect(ROLE_COLORS).toContain("grey");
    expect(ROLE_COLORS).toContain("violet");
  });
});
