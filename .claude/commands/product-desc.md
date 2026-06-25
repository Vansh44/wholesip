---
description: Generate a brand-voice product description (WHOLESIP)
---

This command shares its rules with the dashboard's "Generate with AI" button so both stay identical. The canonical files live in the app so they deploy with the site.

Do this in order:

1. Read `brand/brand.md` in full — the brand soul (voice, tone, values). This is the source of truth for _how_ to sound. If it's empty, stop and tell the user to fill it in.
2. Read `brand/tasks/product-desc.md` — the task rules for _what_ to write. Follow them exactly.
3. Get the product facts:
   - If the user passed a product slug as an argument (`$ARGUMENTS`), read `brand/products/$ARGUMENTS.md` and use only those facts.
   - Otherwise, use the product details the user gives you in the chat.
   - Never invent facts, numbers, ingredients, or claims that aren't provided.
4. Write the description per `brand/tasks/product-desc.md`, then show it for review.
