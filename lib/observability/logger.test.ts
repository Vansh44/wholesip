import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The logger reads NODE_ENV at module-eval time, so we re-import it per env with
// a reset module registry.
async function loadLogger() {
  vi.resetModules();
  return import("./logger");
}

describe("logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("production (structured JSON)", () => {
    beforeEach(() => vi.stubEnv("NODE_ENV", "production"));

    it("emits single-line JSON with severity + message + context to console.log for INFO", async () => {
      const { logInfo } = await loadLogger();
      logInfo("ai call done", { backend: "vertex", ms: 42 });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(parsed).toEqual({
        severity: "INFO",
        message: "ai call done",
        backend: "vertex",
        ms: 42,
      });
    });

    it("routes WARNING to console.warn", async () => {
      const { logWarn } = await loadLogger();
      logWarn("slow");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(warnSpy.mock.calls[0][0] as string).severity).toBe(
        "WARNING",
      );
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("routes ERROR to console.error and appends the stack to message for Error Reporting", async () => {
      const { logError } = await loadLogger();
      const err = new Error("boom");
      logError("checkout failed", err, { orderId: "o1" });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(parsed.severity).toBe("ERROR");
      expect(parsed.error).toBe("boom");
      expect(parsed.orderId).toBe("o1");
      // Stack folded into message so Error Reporting auto-detects it.
      expect(parsed.message).toContain("checkout failed");
      expect(parsed.message).toContain("Error: boom");
    });

    it("normalises a non-Error thrown value", async () => {
      const { logError } = await loadLogger();
      logError("weird", "just a string");
      const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(parsed.error).toBe("just a string");
    });
  });

  describe("development (readable line)", () => {
    beforeEach(() => vi.stubEnv("NODE_ENV", "development"));

    it("prints a human-readable line, not JSON", async () => {
      const { logInfo } = await loadLogger();
      logInfo("hello", { a: 1 });
      expect(logSpy).toHaveBeenCalledWith('[INFO] hello {"a":1}');
    });

    it("omits the context suffix when there is none", async () => {
      const { logInfo } = await loadLogger();
      logInfo("bare");
      expect(logSpy).toHaveBeenCalledWith("[INFO] bare");
    });
  });
});
