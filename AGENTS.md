<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Codebase map — read first, keep updated

@CODEBASE.md

Before making ANY change, consult `CODEBASE.md` (imported above) — it describes the product (StoreMink multi-tenant SaaS), the host-based tenancy architecture, the directory structure, and the project conventions. After any change that adds/removes/moves routes, server actions, lib modules, or SQL files — or changes the architecture — update `CODEBASE.md` in the same commit so it never goes stale.
