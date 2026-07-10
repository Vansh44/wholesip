// Shared Gemini access for every AI copy feature (product descriptions, SEO,
// coupon emails, brand-voice setup). Plain server module — NOT a "use server"
// file — so it can export sync helpers, constants and types alongside the call.
//
// The brand "soul" is PER-STORE data — lib/ai/brand-voice.ts
// (store_brand_profiles); it replaced an earlier file-based loader.

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// The brand soul becomes Gemini's system instruction — its persistent identity.
export function brandSystemText(brand: string): string {
  return `${brand}

The text above is the brand's soul — its voice, tone, values and vocabulary. You ARE this brand speaking. Everything you write must sound exactly like it.`;
}

export interface GeminiOptions {
  temperature?: number;
  maxOutputTokens?: number;
  // Set both to make Gemini return validated JSON instead of free text.
  responseMimeType?: string;
  responseSchema?: unknown;
}

/**
 * One shared call into Gemini: builds the request, retries transient 5xx /
 * network failures with a short backoff, and returns the raw text (or a
 * friendly error). The API key is read here and never leaves the server.
 */
export async function callGemini(
  systemText: string,
  userText: string,
  options: GeminiOptions = {},
): Promise<{ text?: string; error?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY is not set in .env.local." };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 1024,
      // gemini-2.5-flash "thinks" before answering, and those tokens come out
      // of maxOutputTokens — with a long brand soul that can eat the whole
      // budget and truncate the answer. Turn thinking off for these short tasks.
      thinkingConfig: { thinkingBudget: 0 },
      ...(options.responseMimeType
        ? { responseMimeType: options.responseMimeType }
        : {}),
      ...(options.responseSchema
        ? { responseSchema: options.responseSchema }
        : {}),
    },
  });

  // Gemini intermittently returns a transient 500 (INTERNAL) or 503
  // (UNAVAILABLE); its docs say to retry. Try a few times with a short backoff.
  // Bail immediately on permanent client errors (400/403).
  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
        cache: "no-store",
      });
    } catch (err) {
      console.error(
        `Gemini network error (attempt ${attempt}/${MAX_ATTEMPTS}):`,
        err,
      );
      res = null;
    }

    if (res?.ok) break;
    if (res && (res.status === 400 || res.status === 403)) break;
    if (attempt < MAX_ATTEMPTS)
      await new Promise((r) => setTimeout(r, 600 * attempt));
  }

  if (!res) {
    return {
      error:
        "Could not reach the AI service. Check your connection and try again.",
    };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("Gemini API error:", res.status, errBody);
    if (res.status === 400 || res.status === 403)
      return {
        error: "AI request rejected — check that GEMINI_API_KEY is valid.",
      };
    if (res.status >= 500)
      return {
        error:
          "The AI service is busy right now. Please try again in a moment.",
      };
    return { error: `AI request failed (${res.status}). Try again.` };
  }

  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  const text = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!text) return { error: "The AI returned an empty response. Try again." };
  return { text };
}
