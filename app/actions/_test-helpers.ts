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
  in: ReturnType<typeof vi.fn>;
  like: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
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
    in: vi.fn(() => chain),
    like: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    order: vi.fn(() => chain),
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
    storage: {
      from: vi.fn().mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
    _tables: tables,
  } as any;
}
