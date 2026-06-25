/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fs/promises so loadBrandSoul never touches the real filesystem.
vi.mock("fs/promises", () => {
  const readFile = vi.fn();
  return { readFile, default: { readFile } };
});

import { readFile } from "fs/promises";
import {
  GEMINI_MODEL,
  loadBrandSoul,
  brandSystemText,
  callGemini,
} from "./gemini";

const mockReadFile = vi.mocked(readFile);

// Build a minimal fake fetch Response.
function fakeResponse({
  ok,
  status,
  json,
  text,
}: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): Response {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => text ?? "",
  } as unknown as Response;
}

// A canonical successful Gemini payload.
const okJson = (text: string) => ({
  candidates: [{ content: { parts: [{ text }] } }],
});

describe("loadBrandSoul", () => {
  beforeEach(() => {
    mockReadFile.mockReset();
  });

  it("returns trimmed brand content", async () => {
    mockReadFile.mockResolvedValue(
      "  We are WholeSip, calm and warm.  \n" as any,
    );
    await expect(loadBrandSoul()).resolves.toBe(
      "We are WholeSip, calm and warm.",
    );
  });

  it("returns null when the file is only the placeholder HTML comment", async () => {
    mockReadFile.mockResolvedValue("<!-- paste brand here -->" as any);
    await expect(loadBrandSoul()).resolves.toBeNull();
  });

  it("returns null when readFile rejects (file missing)", async () => {
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    await expect(loadBrandSoul()).resolves.toBeNull();
  });

  it("strips HTML comments and trims the remaining content", async () => {
    mockReadFile.mockResolvedValue(
      "<!-- template note -->\n  Real brand voice.  <!-- trailing -->\n" as any,
    );
    await expect(loadBrandSoul()).resolves.toBe("Real brand voice.");
  });

  it("returns null when the content is only whitespace", async () => {
    mockReadFile.mockResolvedValue("   \n\t  " as any);
    await expect(loadBrandSoul()).resolves.toBeNull();
  });
});

describe("brandSystemText", () => {
  it("embeds the brand text and appends the brand's soul instruction", () => {
    const brand = "We are WholeSip.";
    const out = brandSystemText(brand);
    expect(out).toContain(brand);
    expect(out).toContain("The text above is the brand's soul");
    expect(out).toContain("You ARE this brand speaking.");
    // Brand text comes first, instruction after.
    expect(out.indexOf(brand)).toBeLessThan(out.indexOf("brand's soul"));
  });
});

describe("GEMINI_MODEL", () => {
  it("is a non-empty model id string", () => {
    expect(typeof GEMINI_MODEL).toBe("string");
    expect(GEMINI_MODEL.length).toBeGreaterThan(0);
  });
});

describe("callGemini", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    // Silence the source's console.error noise on the failure paths.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("errors when GEMINI_API_KEY is not set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await callGemini("sys", "user");
    expect(result.error).toBe("GEMINI_API_KEY is not set in .env.local.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns trimmed text on a successful response and builds the request correctly", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: true, status: 200, json: okJson("  hello  ") }),
    );

    const result = await callGemini("system prompt", "user prompt");
    expect(result).toEqual({ text: "hello" });
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain(GEMINI_MODEL);
    expect(url).toContain("generateContent");
    expect(init.method).toBe("POST");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe("system prompt");
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("user prompt");
    expect(body.generationConfig.temperature).toBe(0.7);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    // No JSON-mode options unless requested.
    expect(body.generationConfig.responseMimeType).toBeUndefined();
    expect(body.generationConfig.responseSchema).toBeUndefined();
  });

  it("honors temperature and maxOutputTokens overrides", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: true, status: 200, json: okJson("ok") }),
    );

    await callGemini("s", "u", { temperature: 0.2, maxOutputTokens: 256 });
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.2);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it("includes responseMimeType and responseSchema in generationConfig when provided", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: true, status: 200, json: okJson("ok") }),
    );

    const schema = { type: "object", properties: { name: { type: "string" } } };
    await callGemini("s", "u", {
      responseMimeType: "application/json",
      responseSchema: schema,
    });

    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toEqual(schema);
  });

  it("concatenates multiple parts of the candidate response", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({
        ok: true,
        status: 200,
        json: {
          candidates: [
            { content: { parts: [{ text: "foo" }, { text: "bar" }] } },
          ],
        },
      }),
    );
    const result = await callGemini("s", "u");
    expect(result).toEqual({ text: "foobar" });
  });

  it("bails immediately on a 400 and returns the rejection error", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: false, status: 400, text: "bad request" }),
    );

    const result = await callGemini("s", "u");
    expect(result.error).toBe(
      "AI request rejected — check that GEMINI_API_KEY is valid.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bails immediately on a 403 and returns the rejection error", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: false, status: 403, text: "forbidden" }),
    );

    const result = await callGemini("s", "u");
    expect(result.error).toBe(
      "AI request rejected — check that GEMINI_API_KEY is valid.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a generic error for other non-OK statuses (e.g. 404)", async () => {
    // 404 is neither 400/403 (immediate bail) nor 5xx, so the loop still runs
    // all attempts before falling through to the generic message.
    vi.useFakeTimers();
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: false, status: 404, text: "not found" }),
    );

    const promise = callGemini("s", "u");
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1200);

    const result = await promise;
    expect(result.error).toBe("AI request failed (404). Try again.");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries 500s up to MAX_ATTEMPTS then returns the busy error", async () => {
    vi.useFakeTimers();
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: false, status: 500, text: "internal" }),
    );

    const promise = callGemini("s", "u");
    // Advance through the two backoff sleeps (600ms, then 1200ms).
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1200);

    const result = await promise;
    expect(result.error).toBe(
      "The AI service is busy right now. Please try again in a moment.",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("succeeds after a transient 500 on the first attempt", async () => {
    vi.useFakeTimers();
    (fetch as any)
      .mockResolvedValueOnce(
        fakeResponse({ ok: false, status: 503, text: "unavailable" }),
      )
      .mockResolvedValueOnce(
        fakeResponse({ ok: true, status: 200, json: okJson("recovered") }),
      );

    const promise = callGemini("s", "u");
    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;
    expect(result).toEqual({ text: "recovered" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns the unreachable error when fetch rejects on every attempt", async () => {
    vi.useFakeTimers();
    (fetch as any).mockRejectedValue(new Error("network down"));

    const promise = callGemini("s", "u");
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1200);

    const result = await promise;
    expect(result.error).toBe(
      "Could not reach the AI service. Check your connection and try again.",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns the empty-response error when candidates are missing", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: true, status: 200, json: {} }),
    );

    const result = await callGemini("s", "u");
    expect(result.error).toBe("The AI returned an empty response. Try again.");
  });

  it("returns the empty-response error when the text is blank", async () => {
    (fetch as any).mockResolvedValue(
      fakeResponse({ ok: true, status: 200, json: okJson("   ") }),
    );

    const result = await callGemini("s", "u");
    expect(result.error).toBe("The AI returned an empty response. Try again.");
  });

  it("returns the empty-response error when json parsing yields null", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
      text: async () => "",
    } as unknown as Response);

    const result = await callGemini("s", "u");
    expect(result.error).toBe("The AI returned an empty response. Try again.");
  });
});
