# TASK MODULE — SEO title & meta description

> Runs on top of `brand.md` (the soul). The soul decides _how SOAKD sounds_; this file decides _what this job is_. Your server loads `brand.md` first, then the product's form fields (including the product description, the richest input), then appends this task.

## The job

Write the two SEO fields for a single SOAKD product: a **SEO title** and a **SEO meta description**. These are what show up in Google search results and browser tabs — so they must be clear and findable first, and unmistakably SOAKD second. They are NOT the storefront description; they are short, factual, search-facing copy.

_(Context: the title does the ranking work; the meta description's real job is to earn the click once you're on the results page — so make it warm and compelling, not keyword-stuffed. Google may rewrite the description anyway.)_

## Inputs you'll be given

The product's form fields — typically name, category, price, variants, and (usually) the full product description. Treat these as the only source of facts. The product description, when present, is your best raw material — distil it, don't repeat it.

## Output format (strict)

Return ONLY a JSON object with exactly these two keys, nothing else:

- `seo_title` — a string
- `seo_description` — a string

No markdown, no code fences, no commentary around the JSON.

## Rules for the SEO TITLE

- Length: ~50–60 characters. Aim under 60 (Google truncates beyond it). Treat this as a target — see the server-side note below, which enforces it for real.
- **Lead with the searchable term** — the product type or common name a real person would actually type (e.g. "Almond Milk", "Badam Ragda Drink", "Whole-Food Protein Drink"). A new SKU name like "SOAK 01" has no search volume, so it must never lead; it can follow.
- You may end with the brand using a separator, e.g. `Almond Milk — Stone-Crushed, Whole | SOAKD`, but only if it still fits comfortably under 60 characters. If it won't fit, drop the brand, never the searchable term.
- Plain, searchable words a real person would type. No hype, no ALL CAPS, no exclamation marks, no emoji.

## Rules for the SEO DESCRIPTION (meta description)

- Length: ~140–160 characters. Aim under 160. Again a target; the server guard enforces it.
- One or two calm sentences. Say what it is and why it's real/different, in SOAKD's voice — warm, honest, never pushy.
- Naturally include the kind of words someone would search for (e.g. the product type, "whole-food", "no isolates") — woven in, never stuffed.
- Make it meaningfully different from the title — not a paraphrase of it. The title names the thing; the description gives the reason to click.
- No hard sell, no "buy now", "limited", "best ever", no clickbait, no urgency. No medical or curative claims. Calm confidence reads as premium.
- End so it reads complete — a soft note is fine, a sales push is not.

## Shared rules

- Use ONLY facts present in the inputs. If a detail isn't given, leave it out — never invent a fact, number, or claim.
- Stay inside the brand's banned-words and no-claims rules from the soul file.
- Both fields must be plain text (the JSON string values) — no surrounding quotation marks of your own, no markdown.

## The exact instruction to append in the generate call

Paste this as the final line of the prompt, after the soul file and the product fields:

```
Return ONLY a JSON object with two string keys: "seo_title" and
"seo_description". seo_title: aim for 50–60 characters (stay under 60), LEAD
with the searchable product type or common name a person would type (not the
SKU name, which can follow), plain and searchable, optionally "| SOAKD" if it
still fits, no hype or caps. seo_description: aim for 140–160 characters (stay
under 160), one or two calm sentences in SOAKD's voice saying what it is and
why it's real, with natural search words, clearly different from the title, no
hard sell, no urgency, no medical claims. Use only the product details
provided above — never invent a fact or number. Output the raw JSON only: no
markdown, no code fences, no extra text.
```

## Server-side handling (the model can't be trusted to do this)

Language models cannot count characters reliably and will sometimes overshoot the limits or wrap the JSON in code fences. The prompt limits are targets; enforce them in code:

1. **Parse defensively.** Strip any ` ``` ` / ` ```json ` fences, then `JSON.parse` inside a `try/catch`. On failure, regenerate once before erroring.
2. **Enforce length.** After parsing, check `seo_title.length <= 60` and `seo_description.length <= 160`. If either is over, truncate at the last word boundary (or regenerate once). This is the only thing that actually guarantees the limits.
3. **Sanity-check keys.** Confirm exactly `seo_title` and `seo_description` exist and are non-empty strings before saving.

## A quick self-check before returning

- Does the title LEAD with a real searchable term (not the SKU), and is every fact from the inputs?
- Is the title aiming under 60 and the description under 160 characters?
- Is the description warm, SOAKD, and clearly different from the title — with zero hype, urgency, or invented claims?
- Is the output valid JSON with exactly `seo_title` and `seo_description`, and nothing else?
