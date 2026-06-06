// Client-side slug preview. Mirrors the server's slugify in the catalog
// actions so the editor shows the same slug the server will persist.
// (The server still owns uniqueness — it appends -2, -3, … on collisions.)
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
