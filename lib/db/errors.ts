// Helpers for interpreting errors thrown by the Drizzle/pg data layer.
// Drizzle may surface the pg error directly or wrapped (DrizzleQueryError with
// the pg error as `cause`), so always check both places.

export const UNIQUE_VIOLATION = "23505";

/** The Postgres SQLSTATE code of a thrown DB error, if any. */
export function pgErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === UNIQUE_VIOLATION;
}

/** Prefer the underlying pg message (the wrapper's message embeds the SQL). */
export function dbErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; cause?: { message?: string } };
    return e.cause?.message ?? e.message ?? fallback;
  }
  return fallback;
}
