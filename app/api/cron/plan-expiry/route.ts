import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG } from "@/lib/store/resolve";

// Durably flips expired timed plans to free (see lib/plans.ts effectivePlan —
// the read-time guard already treats them as free the moment they lapse; this
// job makes the row itself honest and writes the audit trail). Driven by
// Vercel Cron daily (vercel.json).
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

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Snapshot the lapsed stores first — the UPDATE returns new values, and the
  // audit rows need the plan each store is falling FROM.
  const { data: lapsed, error: readErr } = await admin
    .from("stores")
    .select("id, plan")
    .neq("plan", "free")
    .lte("plan_expires_at", nowIso);
  if (readErr) {
    console.error("plan-expiry (read):", readErr.message);
    return NextResponse.json({ error: "read failed" }, { status: 500 });
  }
  if (!lapsed?.length) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  // Re-check the expiry inside the UPDATE so a store whose plan was extended
  // between the snapshot and now is left alone; .select() returns only the
  // rows actually flipped, which is what gets audited.
  const { data: flipped, error: updateErr } = await admin
    .from("stores")
    .update({ plan: "free", plan_expires_at: null })
    .in(
      "id",
      lapsed.map((s) => s.id),
    )
    .neq("plan", "free")
    .lte("plan_expires_at", nowIso)
    .select("id");
  if (updateErr) {
    console.error("plan-expiry (update):", updateErr.message);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  const flippedIds = new Set((flipped ?? []).map((s) => s.id as string));
  const events = lapsed
    .filter((s) => flippedIds.has(s.id as string))
    .map((s) => ({
      store_id: s.id as string,
      from_plan: s.plan as string,
      to_plan: "free",
      source: "system",
      actor: "plan-expiry-cron",
      note: "plan expired",
    }));
  if (events.length) {
    // Best-effort audit trail — the flip itself is the source of truth.
    const { error: auditErr } = await admin.from("plan_events").insert(events);
    if (auditErr) console.error("plan-expiry (audit):", auditErr.message);
    revalidateTag(STORE_TAG, "max");
  }

  return NextResponse.json({ ok: true, expired: events.length });
}

export const GET = handle;
export const POST = handle;
