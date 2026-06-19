-- =============================================================
-- Supabase migration: blog_likes (anonymous blog reactions)
-- Reactions do NOT require login. Each browser gets a random visitor_id stored
-- in localStorage. A visitor may leave MULTIPLE different reactions on a post
-- (one row per emoji), so the uniqueness is (blog_id, visitor_id, reaction) —
-- this keeps one row per emoji while allowing several emojis per visitor. The
-- `reaction` column holds which emoji. Reads are public (for the counts);
-- writes happen ONLY through the service-role action (toggleBlogReaction), so
-- there are no anon write policies and visitors can't tamper with each other.
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
--
-- MIGRATING an already-applied table:
--   -- add the reaction column if it's the original like-only version:
--   ALTER TABLE blog_likes
--     ADD COLUMN IF NOT EXISTS reaction TEXT NOT NULL DEFAULT 'like'
--     CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'celebrate'));
--   -- switch the per-visitor uniqueness to per-visitor-per-reaction:
--   ALTER TABLE blog_likes DROP CONSTRAINT IF EXISTS blog_likes_blog_id_visitor_id_key;
--   ALTER TABLE blog_likes
--     ADD CONSTRAINT blog_likes_blog_visitor_reaction_key
--     UNIQUE (blog_id, visitor_id, reaction);
-- =============================================================

CREATE TABLE IF NOT EXISTS blog_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id     UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  visitor_id  TEXT NOT NULL,                       -- random per-browser id (localStorage)
  reaction    TEXT NOT NULL DEFAULT 'like'
                CHECK (reaction IN ('like', 'love', 'haha', 'wow', 'celebrate')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT blog_likes_blog_visitor_reaction_key
    UNIQUE (blog_id, visitor_id, reaction)         -- one row per emoji per visitor
);

CREATE INDEX IF NOT EXISTS idx_blog_likes_blog ON blog_likes (blog_id);

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE blog_likes ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. logged-out visitors) can read likes — needed for the count.
DROP POLICY IF EXISTS "Anyone can read blog likes" ON blog_likes;
CREATE POLICY "Anyone can read blog likes"
  ON blog_likes FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies: those operations run via the service-role
-- key inside the toggleBlogLike server action, which bypasses RLS.
