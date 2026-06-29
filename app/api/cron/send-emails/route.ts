import { after } from "next/server";
import { NextResponse } from "next/server";
import { processEmailQueue } from "@/lib/email/campaign-worker";
import { triggerEmailWorker } from "@/lib/email/trigger-worker";

// Drains the email campaign queue. Driven two ways:
//   1. Vercel Cron (see vercel.json) as the reliable heartbeat.
//   2. Self-chaining: if recipients remain after a run, kick another run via
//      after() so a large campaign drains in minutes, not on the cron cadence.
//
// Auth: requires `Authorization: Bearer <CRON_SECRET>`. Vercel Cron is
// configured to send this header. Set CRON_SECRET in the environment.

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processEmailQueue();

  // More to do? Chain another run after this response is sent.
  if (result.remaining > 0) {
    after(() => triggerEmailWorker());
  }

  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
