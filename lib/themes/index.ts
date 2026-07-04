// Server-side theme resolution. NEVER import this from a client component —
// definitions embed large custom_code strings and sample data; the signup
// picker imports lib/themes/meta.ts instead.
import { DEFAULT_THEME_ID } from "./meta";
import { basket } from "./definitions/basket";
import type { ThemeDefinition } from "./types";

export const THEME_DEFINITIONS: readonly ThemeDefinition[] = [basket];

const BY_ID = new Map(THEME_DEFINITIONS.map((t) => [t.id, t]));

/** Resolve a theme id (e.g. stores.settings.template) — unknown → default. */
export function getThemeDefinition(id: unknown): ThemeDefinition {
  if (typeof id === "string") {
    const t = BY_ID.get(id);
    if (t) return t;
  }
  return BY_ID.get(DEFAULT_THEME_ID)!;
}
