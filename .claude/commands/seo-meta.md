---
description: Generate SEO title & meta description (SOAKD)
---

This command shares its rules with the dashboard's SEO "Generate with AI" button so both stay identical. The canonical files live in the app so they deploy with the site.

Do this in order:

1. Read `brand/brand.md` in full — the brand soul (voice, tone, values). If it's empty, stop and tell the user to fill it in.
2. Read `brand/tasks/seo-meta.md` — the task rules for the SEO fields. Follow them exactly, including the strict JSON output shape and the length limits.
3. Get the product facts:
   - If the user passed a product slug as an argument (`$ARGUMENTS`), read `brand/products/$ARGUMENTS.md` and use only those facts.
   - Otherwise, use the product details the user gives you (the product description, when available, is the best raw material).
   - Never invent facts, numbers, or claims that aren't provided.
4. Produce the `seo_title` and `seo_description` per `brand/tasks/seo-meta.md`, then show them for review.
