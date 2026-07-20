import { defineConfig } from "drizzle-kit";

// Drizzle Kit config for introspection (pull), migration generation (generate),
// and applying migrations (migrate) — GCP migration Phase 5.
//
// Connects over the Cloud SQL Auth Proxy (localhost) for local/dev work; point
// DB_HOST/DB_PORT/DB_* at each environment when applying migrations
// (local → staging → prod). Only the `public` schema is managed here — the
// `auth` shim lives in a hand-written migration.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 6543),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "storemink",
    ssl: false,
  },
});
