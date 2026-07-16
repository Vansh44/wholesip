/* eslint-disable @typescript-eslint/no-explicit-any */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase query chains. Each call returns `this`, so you can chain
// freely. There are two distinct terminal shapes:
//
//   - `.single()` / `.maybeSingle()` resolve to `singleResult` (a single row)
//   - awaiting the chain directly (insert/update/delete/list select) resolves
//     to `listResult` (a list / count / status response)
//
// Splitting them lets a single mock serve both an `.select().like()` slug
// lookup AND an `.insert().select().single()` row insert without conflict.
// ---------------------------------------------------------------------------

export interface ChainMock {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  contains: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  gte: ReturnType<typeof vi.fn>;
  lt: ReturnType<typeof vi.fn>;
  lte: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: any) => any;
}

/**
 * Fluent Supabase chain.
 *   singleResult — what `.single()` / `.maybeSingle()` resolve to.
 *   listResult   — what awaiting the chain directly (no terminal) resolves to.
 */
export function makeChain(
  singleResult: any = { data: null, error: null },
  listResult: any = { data: [], error: null },
): ChainMock {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    contains: vi.fn(() => chain),
    like: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    or: vi.fn(() => chain),
    not: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(singleResult),
    maybeSingle: vi.fn().mockResolvedValue(singleResult),
    // Awaiting the chain directly (no terminal) — used by list selects,
    // update().eq(), delete().eq(), insert without .select(), etc.
    then: (resolve: any) => Promise.resolve(listResult).then(resolve),
  };
  return chain;
}

/**
 * Routes `.from(table)` to a per-table chain so a single action can drive
 * multiple tables in one test.
 *
 * Example:
 *   const supabase = makeSupabase({
 *     blogs: makeChain({ data: { id: 1 }, error: null }),
 *     customers: makeChain({ data: { first_name: "A" }, error: null }),
 *   });
 */
// ---------------------------------------------------------------------------
// Mock Drizzle db (GCP migration Phase 5). Mirrors the fragment of the Drizzle
// query API our ported server actions use, recording the args so tests can
// assert on insert/update payloads without a real database. Pair it with a
// mock of `@/lib/db/client` whose with* runners invoke the callback with .db:
//
//   const dbHolder = vi.hoisted(() => ({ current: null as any }));
//   vi.mock("@/lib/db/client", () => ({
//     withUser: vi.fn((_id: any, fn: any) => fn(dbHolder.current.db)),
//     withService: vi.fn((fn: any) => fn(dbHolder.current.db)),
//     withAnon: vi.fn((fn: any) => fn(dbHolder.current.db)),
//   }));
//   beforeEach(() => { dbHolder.current = makeDbMock({ returning: [{ id: "c1" }] }); });
// ---------------------------------------------------------------------------

export interface DbMock {
  db: any;
  calls: {
    insert: any[];
    values: any[];
    update: any[];
    set: any[];
    delete: any[];
    where: any[];
    select: any[];
    onConflict: any[];
  };
}

export function makeDbMock(
  opts: { returning?: any[]; selectQueue?: any[][] } = {},
): DbMock {
  const returning = opts.returning ?? [{ id: "row-1" }];
  // Each db.select() consumes the next entry (an action doing a slug lookup
  // then an image prefetch gets queue[0] then queue[1]); empty queue → [].
  const selectQueue = [...(opts.selectQueue ?? [])];
  const calls: DbMock["calls"] = {
    insert: [],
    values: [],
    update: [],
    set: [],
    delete: [],
    where: [],
    select: [],
    onConflict: [],
  };

  // A thenable step that also exposes .where()/.returning() terminals, so both
  // `await db.update().set().where()` and `db.insert().values().returning()`
  // resolve correctly.
  const step = (result: any): any => ({
    where: vi.fn((c: any) => {
      calls.where.push(c);
      return step(result);
    }),
    onConflictDoUpdate: vi.fn((c: any) => {
      calls.onConflict.push(c);
      return step(result);
    }),
    onConflictDoNothing: vi.fn((c: any) => {
      calls.onConflict.push(c);
      return step(result);
    }),
    returning: vi.fn(async () => returning),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  });

  // A fully-chainable select step; awaiting it resolves to `rows`.
  const selectStep = (rows: any[]): any => {
    const s: any = {
      from: vi.fn(() => s),
      where: vi.fn((c: any) => {
        calls.where.push(c);
        return s;
      }),
      leftJoin: vi.fn(() => s),
      innerJoin: vi.fn(() => s),
      groupBy: vi.fn(() => s),
      orderBy: vi.fn(() => s),
      limit: vi.fn(() => s),
      offset: vi.fn(() => s),
      then: (resolve: any) => Promise.resolve(rows).then(resolve),
    };
    return s;
  };

  const db: any = {
    select: vi.fn((projection?: any) => {
      calls.select.push(projection);
      return selectStep(selectQueue.length ? selectQueue.shift()! : []);
    }),
    insert: vi.fn((t: any) => {
      calls.insert.push(t);
      return {
        values: vi.fn((v: any) => {
          calls.values.push(v);
          return step(returning);
        }),
      };
    }),
    update: vi.fn((t: any) => {
      calls.update.push(t);
      return {
        set: vi.fn((v: any) => {
          calls.set.push(v);
          return step({ rowCount: 1 });
        }),
      };
    }),
    delete: vi.fn((t: any) => {
      calls.delete.push(t);
      return step({ rowCount: 1 });
    }),
  };

  return { db, calls };
}

export function makeSupabase(
  tables: Record<string, ChainMock> = {},
  user: any = { id: "user-1" },
) {
  const from = vi.fn((table: string) => {
    if (!tables[table]) tables[table] = makeChain();
    return tables[table];
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      updateUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "new-user" } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from,
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn().mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
        upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
    _tables: tables,
  } as any;
}
