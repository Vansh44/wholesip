import "server-only";

/**
 * Fire the background email worker without blocking the caller. Used right
 * after a campaign is enqueued (via `after()`) so the queue starts draining
 * immediately instead of waiting for the next cron tick.
 *
 * Best-effort: if CRON_SECRET / NEXT_PUBLIC_APP_URL aren't configured, or the
 * request fails, we just log — the cron schedule is the reliable fallback.
 */
export async function triggerEmailWorker(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!secret || !base) {
    console.warn(
      "Email worker not kicked (CRON_SECRET / NEXT_PUBLIC_APP_URL unset); the cron job will drain the queue.",
    );
    return;
  }
  try {
    await fetch(`${base.replace(/\/$/, "")}/api/cron/send-emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      // Don't let a slow worker hold the triggering request's lifetime open.
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error("Failed to trigger email worker:", e);
  }
}
