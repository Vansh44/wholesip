"use server";

import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORE_TAG, WHOLESIP_STORE_ID } from "@/lib/store/resolve";
import { getThemeDefinition } from "@/lib/themes";
import { applyTheme } from "@/lib/themes/apply";
import { deleteStorageUrls } from "@/lib/supabase/storage-cleanup";
import { PLAN_IDS, PLAN_META, normalizePlan, type Plan } from "@/lib/plans";
import { currentPeriod } from "@/lib/ai/quota";

// A Storemink platform operator (from platform_admins, by JWT email).
export interface PlatformViewer {
  email: string;
  role: "superadmin" | "member";
}

export async function getPlatformViewer(): Promise<PlatformViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  // Exact (case-normalised) match, not `.ilike()` — see access.ts getPlatformRole:
  // a user-controlled email used as a LIKE pattern is a privilege-escalation vector.
  const { data } = await supabase
    .from("platform_admins")
    .select("email, role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  return {
    email: data.email as string,
    role: data.role as "superadmin" | "member",
  };
}

export interface PlatformStoreRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  plan_expires_at: string | null; // timed plans — null = indefinite
  custom_domain: string | null;
  created_at: string;
  owner_email: string | null; // superadmin who set the store up (from admins)
  ai_used: number; // AI generations consumed this calendar month
  credit_balance: number; // purchased/granted AI credits remaining
  /** BYO payment gateway state: none = not connected. Never the keys. */
  gateway: "none" | "enabled" | "paused";
}

// Strip PostgREST filter-control chars so a search term can't break .or().
function sanitize(q: string): string {
  return q
    .replace(/[(),:*%\\]/g, " ")
    .trim()
    .slice(0, 80);
}

// Every store on the platform (operator-only; service role bypasses per-store RLS).
export async function listAllStores(q?: string): Promise<PlatformStoreRow[]> {
  if (!(await getPlatformViewer())) return [];
  const admin = createAdminClient();
  let query = admin
    .from("stores")
    .select(
      "id, slug, name, status, plan, plan_expires_at, custom_domain, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  const term = sanitize(q ?? "");
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) {
    console.error("listAllStores:", error.message);
    return [];
  }

  const stores = (data ?? []).map(
    (s): PlatformStoreRow => ({
      ...s,
      owner_email: null,
      ai_used: 0,
      credit_balance: 0,
      gateway: "none" as const,
    }),
  ) as PlatformStoreRow[];

  // Enrich the rows in four batch queries (never per-store): owner email,
  // this month's AI usage, the credit balance, and the BYO gateway state.
  if (stores.length) {
    const ids = stores.map((s) => s.id);
    const [{ data: owners }, { data: usage }, { data: credits }, { data: gw }] =
      await Promise.all([
        admin
          .from("admins")
          .select("store_id, email, created_at")
          .in("store_id", ids)
          .eq("role", "superadmin")
          .order("created_at", { ascending: true }),
        admin
          .from("ai_usage")
          .select("store_id, used")
          .in("store_id", ids)
          .eq("period", currentPeriod()),
        admin
          .from("ai_credit_balances")
          .select("store_id, balance")
          .in("store_id", ids),
        admin
          .from("store_payment_providers")
          .select("store_id, enabled")
          .in("store_id", ids),
      ]);

    // Earliest superadmin per store wins as "owner".
    const ownerByStore = new Map<string, string>();
    for (const o of owners ?? []) {
      const sid = o.store_id as string;
      if (!ownerByStore.has(sid) && o.email)
        ownerByStore.set(sid, o.email as string);
    }
    const usedByStore = new Map(
      (usage ?? []).map((u) => [u.store_id as string, u.used as number]),
    );
    const creditsByStore = new Map(
      (credits ?? []).map((c) => [c.store_id as string, c.balance as number]),
    );
    const gatewayByStore = new Map(
      (gw ?? []).map((g) => [
        g.store_id as string,
        g.enabled ? ("enabled" as const) : ("paused" as const),
      ]),
    );

    for (const s of stores) {
      s.owner_email = ownerByStore.get(s.id) ?? null;
      s.ai_used = usedByStore.get(s.id) ?? 0;
      s.credit_balance = creditsByStore.get(s.id) ?? 0;
      s.gateway = gatewayByStore.get(s.id) ?? "none";
    }
  }

  return stores;
}

export interface ActionResult {
  success?: boolean;
  error?: string;
}

// Suspend / reactivate a store (platform superadmin only). A suspended store
// stops resolving on the storefront (Read stores policy requires status=active).
export async function setStoreStatus(
  storeId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") {
    return { error: "Only a platform superadmin can change store status." };
  }
  if (!["active", "suspended"].includes(status)) {
    return { error: "Invalid status." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("stores")
    .update({ status })
    .eq("id", storeId);
  if (error) {
    console.error("setStoreStatus:", error.message);
    return { error: "Could not update the store. Please try again." };
  }
  revalidateTag(STORE_TAG, "max");
  return { success: true };
}

// Set a store's plan (platform superadmin only) — ANY direction, optionally
// time-boxed. Downgrades are soft (existing data is never deleted; creating
// new rows past the smaller plan's caps is what gets blocked — lib/plans.ts).
// `expiresAt` bounds the grant: an ISO timestamp in the future, or null for
// indefinite. Expired plans behave as free immediately (effectivePlan) and are
// durably flipped by /api/cron/plan-expiry. Every change is recorded in the
// append-only plan_events audit log.
export async function setStorePlan(
  storeId: string,
  targetPlan: string,
  opts?: { expiresAt?: string | null },
): Promise<ActionResult> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") {
    return { error: "Only a platform superadmin can change store plans." };
  }
  if (!PLAN_IDS.includes(targetPlan as Plan)) {
    return { error: "Invalid plan." };
  }
  const target = targetPlan as Plan;

  // Free never expires (there is nothing to lapse to); paid plans may carry
  // an expiry, which must parse and lie in the future.
  let expiresAt: string | null = null;
  if (target !== "free" && opts?.expiresAt != null) {
    const parsed = new Date(opts.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Invalid expiry date." };
    }
    if (parsed.getTime() <= Date.now()) {
      return { error: "The expiry date must be in the future." };
    }
    expiresAt = parsed.toISOString();
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id, plan, plan_expires_at")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return { error: "Store not found." };

  const current = normalizePlan(store.plan);
  if (
    current === target &&
    (store.plan_expires_at ?? null) === (expiresAt ?? null)
  ) {
    return { error: `This store is already on ${PLAN_META[target].name}.` };
  }

  const { error } = await admin
    .from("stores")
    .update({ plan: target, plan_source: "comp", plan_expires_at: expiresAt })
    .eq("id", storeId)
    .eq("plan", store.plan); // no-op if the plan changed under us (stale row)
  if (error) {
    console.error("setStorePlan:", error.message);
    return { error: "Could not update the plan. Please try again." };
  }

  // Best-effort audit trail — the plan change itself is the source of truth.
  const { error: auditErr } = await admin.from("plan_events").insert({
    store_id: storeId,
    from_plan: current,
    to_plan: target,
    source: "operator",
    actor: viewer.email,
    note: expiresAt
      ? `expires ${expiresAt.slice(0, 10)}`
      : target === "free"
        ? null
        : "indefinite",
  });
  if (auditErr) console.error("setStorePlan (audit):", auditErr.message);

  // Plan gates feature settings (minPlan) — bust the cached store lookups so
  // the store's dashboard + storefront see the new plan immediately.
  revalidateTag(STORE_TAG, "max");
  return { success: true };
}

// Grant free AI credits to a store (platform superadmin only). Goes through
// the same atomic add_ai_credits RPC as purchases, so every grant lands in the
// append-only ai_credit_ledger with the operator's email as the ref.
const MAX_CREDIT_GRANT = 10_000;

export async function grantAiCredits(
  storeId: string,
  amount: number,
  note?: string,
): Promise<ActionResult> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") {
    return { error: "Only a platform superadmin can grant credits." };
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CREDIT_GRANT) {
    return {
      error: `Credits must be a whole number between 1 and ${MAX_CREDIT_GRANT}.`,
    };
  }

  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return { error: "Store not found." };

  const { error } = await admin.rpc("add_ai_credits", {
    p_store: storeId,
    p_delta: amount,
    p_kind: "grant",
    p_ref: viewer.email,
    p_note: sanitize(note ?? "").slice(0, 200) || null,
  });
  if (error) {
    console.error("grantAiCredits:", error.message);
    return { error: "Could not grant credits. Please try again." };
  }
  return { success: true };
}

// Per-store audit history for the console drawer: plan changes (plan_events)
// + the AI-credit ledger. Read-only, superadmin-gated like the mutations.
export interface StoreAuditData {
  planEvents: Array<{
    id: string;
    from_plan: string | null;
    to_plan: string;
    source: string;
    actor: string | null;
    note: string | null;
    created_at: string;
  }>;
  creditLedger: Array<{
    id: string;
    delta: number;
    kind: string;
    ref: string | null;
    note: string | null;
    created_at: string;
  }>;
}

export async function getStoreAudit(
  storeId: string,
): Promise<StoreAuditData | null> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") return null;

  const admin = createAdminClient();
  const [{ data: planEvents }, { data: creditLedger }] = await Promise.all([
    admin
      .from("plan_events")
      .select("id, from_plan, to_plan, source, actor, note, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("ai_credit_ledger")
      .select("id, delta, kind, ref, note, created_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  return {
    planEvents: (planEvents ?? []) as StoreAuditData["planEvents"],
    creditLedger: (creditLedger ?? []) as StoreAuditData["creditLedger"],
  };
}

// Any managed media public URL — Supabase (…/object/public/media/…) OR Google
// Cloud Storage (storage.googleapis.com/<bucket>/…), since a store's media may
// straddle both during the Phase 3 migration. Store media isn't namespaced by
// store in the bucket, so we can't purge by prefix — instead we scrape every
// media URL out of the store's own rows (product images, blog bodies, brand
// logo, page sections…) before the DB rows cascade away, then delete those
// files (deleteStorageUrls routes each URL to the right backend).
const MEDIA_URL_RE =
  /https?:\/\/[^"'\s)]*(?:\/object\/public\/media\/|storage\.googleapis\.com\/[^/"'\s)]+\/)[^"'\s)]+/g;

// PERMANENTLY delete a store and everything belonging to it (platform
// superadmin only). Irreversible. Every store-scoped table FKs stores(id) with
// ON DELETE CASCADE, so one DELETE removes all DB rows; we additionally purge
// the store's uploaded media and delete its owner/staff login accounts (neither
// cascades from the stores table).
export async function deleteStore(storeId: string): Promise<ActionResult> {
  const viewer = await getPlatformViewer();
  if (viewer?.role !== "superadmin") {
    return { error: "Only a platform superadmin can delete a store." };
  }
  // The WholeSip fallback store underpins unresolved-host handling — never let
  // it be deleted from the console.
  if (storeId === WHOLESIP_STORE_ID) {
    return { error: "The WholeSip fallback store can't be deleted." };
  }

  const admin = createAdminClient();

  const { data: store } = await admin
    .from("stores")
    .select("id, settings")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return { error: "Store not found." };

  // 1. Login accounts to delete (auth.users). admins.id AND users.id are both
  //    auth user ids; their rows cascade away with the store, so we collect the
  //    ids first. Each id maps to exactly one store (both are global PKs), so
  //    deleting the auth account is safe. Deduped in case an owner is also a
  //    customer row.
  const authUserIds = new Set<string>();
  const [{ data: staff }, { data: customers }] = await Promise.all([
    admin.from("admins").select("id").eq("store_id", storeId),
    admin.from("users").select("id").eq("store_id", storeId),
  ]);
  for (const r of staff ?? []) authUserIds.add(r.id as string);
  for (const r of customers ?? []) authUserIds.add(r.id as string);

  // 2. Media URLs referenced anywhere in the store's rows (scanned as JSON so we
  //    catch image fields, jsonb arrays AND HTML bodies without per-column code).
  const mediaUrls = new Set<string>();
  const scan = (obj: unknown) => {
    for (const m of JSON.stringify(obj ?? "").match(MEDIA_URL_RE) ?? [])
      mediaUrls.add(m);
  };
  scan(store.settings);
  // Every store-scoped table that can hold an uploaded image (product/variant
  // galleries, category tiles, blog covers+bodies, page sections, review photos,
  // campaign HTML, colour-card art, customer avatars). select("*") + JSON scan
  // means a new image column is covered automatically.
  const MEDIA_TABLES = [
    "products",
    "product_variants",
    "categories",
    "blogs",
    "blog_comments",
    "store_pages",
    "product_reviews",
    "email_campaigns",
    "card_colors",
    "users",
  ];
  for (const table of MEDIA_TABLES) {
    const { data: rows } = await admin
      .from(table)
      .select("*")
      .eq("store_id", storeId);
    if (rows) scan(rows);
  }

  // 3. Delete the store — FK ON DELETE CASCADE wipes every store-scoped row.
  const { error: delErr } = await admin
    .from("stores")
    .delete()
    .eq("id", storeId);
  if (delErr) {
    console.error("deleteStore:", delErr.message);
    return { error: "Could not delete the store. Please try again." };
  }

  // 4. Best-effort cleanup of things that DON'T cascade from stores. The store
  //    is already gone, so failures here are logged but not surfaced as errors.
  await deleteStorageUrls(Array.from(mediaUrls));
  for (const id of authUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("deleteStore (auth user)", id, error.message);
  }

  revalidateTag(STORE_TAG, "max");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Platform operators (RBAC) — manage who can operate Storemink.
// ---------------------------------------------------------------------------

export interface PlatformAdminRow {
  id: string;
  email: string;
  role: "superadmin" | "member";
  created_at: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The operator roster (any operator can view).
export async function listPlatformAdmins(): Promise<PlatformAdminRow[]> {
  if (!(await getPlatformViewer())) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  return (data ?? []) as PlatformAdminRow[];
}

async function requireSuperadmin(): Promise<PlatformViewer | null> {
  const viewer = await getPlatformViewer();
  return viewer?.role === "superadmin" ? viewer : null;
}

// Add (or re-role) a platform operator by email. They're recognised on their
// next login — no account needs to exist yet.
export async function invitePlatformAdmin(
  email: string,
  role: "superadmin" | "member",
): Promise<ActionResult> {
  const me = await requireSuperadmin();
  if (!me) return { error: "Only a platform superadmin can add operators." };
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) return { error: "Enter a valid email." };
  if (!["superadmin", "member"].includes(role))
    return { error: "Invalid role." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_admins")
    .upsert({ email: clean, role }, { onConflict: "email" });
  if (error) {
    console.error("invitePlatformAdmin:", error.message);
    return { error: "Could not add the operator. Please try again." };
  }
  return { success: true };
}

export async function updatePlatformAdminRole(
  id: string,
  role: "superadmin" | "member",
): Promise<ActionResult> {
  if (!(await requireSuperadmin()))
    return { error: "Only a platform superadmin can change roles." };
  const admin = createAdminClient();

  // Don't allow demoting the last remaining superadmin.
  if (role === "member") {
    const { data: target } = await admin
      .from("platform_admins")
      .select("role")
      .eq("id", id)
      .maybeSingle();
    if (target?.role === "superadmin") {
      const { count } = await admin
        .from("platform_admins")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin");
      if ((count ?? 0) <= 1)
        return { error: "Can't demote the last superadmin." };
    }
  }

  const { error } = await admin
    .from("platform_admins")
    .update({ role })
    .eq("id", id);
  if (error) return { error: "Could not update the operator." };
  return { success: true };
}

export async function removePlatformAdmin(id: string): Promise<ActionResult> {
  if (!(await requireSuperadmin()))
    return { error: "Only a platform superadmin can remove operators." };
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("platform_admins")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (target?.role === "superadmin") {
    const { count } = await admin
      .from("platform_admins")
      .select("id", { count: "exact", head: true })
      .eq("role", "superadmin");
    if ((count ?? 0) <= 1)
      return { error: "Can't remove the last superadmin." };
  }

  const { error } = await admin.from("platform_admins").delete().eq("id", id);
  if (error) return { error: "Could not remove the operator." };
  return { success: true };
}

// ---------------------------------------------------------------------------
// Theme demo stores — one real store per theme (slug demo-{themeId}, marked
// settings.demo) that the signup picker's Preview button opens. Re-seedable:
// applyTheme with reset:true wipes the demo's catalog/pages/menus and applies
// the theme fresh, so demos always show the theme's pristine state. No admins
// row is created — nobody logs into a demo store.
// ---------------------------------------------------------------------------

export interface SeedDemoResult {
  success?: boolean;
  error?: string;
  slug?: string;
  warnings?: string[];
}

export async function seedDemoStore(themeId: string): Promise<SeedDemoResult> {
  if (!(await requireSuperadmin())) {
    return { error: "Only a platform superadmin can seed demo stores." };
  }
  const theme = getThemeDefinition(themeId);
  if (theme.id !== themeId) {
    return { error: `Unknown theme "${themeId}".` };
  }

  const admin = createAdminClient();
  const slug = theme.demoSlug;

  // Create the store row if missing.
  const { data: existing } = await admin
    .from("stores")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  let storeId = existing?.id as string | undefined;
  if (!storeId) {
    const { data: created, error } = await admin
      .from("stores")
      .insert({
        slug,
        name: `${theme.name} Demo`,
        status: "active",
        plan: "free",
        settings: {
          demo: true,
          template: theme.id,
          brand: { name: `${theme.name} Demo` },
        },
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("seedDemoStore (insert):", error?.message);
      return { error: "Could not create the demo store." };
    }
    storeId = created.id as string;
  }

  const result = await applyTheme(storeId, theme.id, {
    publish: true,
    reset: true,
  });

  revalidateTag(STORE_TAG, "max");
  if (!result.success) {
    return {
      success: true,
      slug,
      warnings: result.errors,
    };
  }
  return { success: true, slug };
}
