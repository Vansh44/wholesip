// The Cloud SQL data layer (GCP migration Phase 5). Replaces the Supabase
// client factories with Drizzle over a pg Pool, enforcing the 2A tenancy model:
// every query runs inside a transaction that SETs LOCAL the DB role (and, for
// user requests, the app.current_user_id GUC the RLS shim reads). Because
// SET LOCAL is transaction-scoped, identity can NEVER leak across pooled
// connections.
//
// Three scoped runners map 1:1 onto the old Supabase clients:
//   withService  → app_service (BYPASSRLS)  ~ createAdminClient()
//   withUser     → app_user + GUC (RLS)     ~ createClient() (cookie, signed-in)
//   withAnon     → app_user, no GUC (RLS)   ~ createPublicClient() (storefront)
//
// Connection config comes from env: locally DB_HOST=127.0.0.1:DB_PORT via the
// Cloud SQL Auth Proxy; on Cloud Run DB_HOST=/cloudsql/<INSTANCE_CONNECTION_NAME>
// (unix socket). Auth is the `app` login role (member of app_user + app_service).

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../drizzle/schema";
import * as relations from "../../drizzle/relations";

const fullSchema = { ...schema, ...relations };
export type Db = NodePgDatabase<typeof fullSchema>;

let _pool: Pool | undefined;

function getPool(): Pool {
  if (!_pool) {
    const host = process.env.DB_HOST;
    const isUnixSocket = host?.startsWith("/");
    _pool = new Pool({
      host,
      // Unix socket (Cloud Run) ignores port; TCP (local proxy) needs it.
      port: isUnixSocket ? undefined : Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      // The Auth Proxy / unix socket already provide a secure channel.
      ssl: false,
    });
  }
  return _pool;
}

// The DB roles are fixed internal constants (never user input), so interpolating
// them into SET LOCAL ROLE — which cannot take a bind parameter — is safe.
type AppRole = "app_service" | "app_user";

async function runScoped<T>(
  role: AppRole,
  identity: { uid?: string; email?: string } | null,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${role}`);
    if (identity?.uid) {
      // set_config(..., is_local => true) == SET LOCAL; value is parameterised.
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [
        identity.uid,
      ]);
    }
    if (identity?.email) {
      await client.query(
        "SELECT set_config('app.current_user_email', $1, true)",
        [identity.email],
      );
    }
    const db = drizzle(client, { schema: fullSchema });
    const result = await fn(db);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Service-role scope: BYPASSRLS. Tenant scoping is the caller's responsibility
 * (explicit `.eq(store_id, …)`), exactly as the Supabase service client worked.
 */
export function withService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return runScoped("app_service", null, fn);
}

/**
 * Signed-in user scope: RLS enforced, with app.current_user_id (and optional
 * email) set so `auth.uid()`/`auth.email()` resolve inside every policy.
 */
export function withUser<T>(
  identity: { uid: string; email?: string | null },
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  return runScoped(
    "app_user",
    { uid: identity.uid, email: identity.email ?? undefined },
    fn,
  );
}

/**
 * Anonymous scope: RLS enforced with NO identity set, so only the public
 * (published/active) policy branches match — the storefront read path.
 */
export function withAnon<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return runScoped("app_user", null, fn);
}

/** Close the pool (tests / graceful shutdown). */
export async function closePool(): Promise<void> {
  await _pool?.end();
  _pool = undefined;
}
