-- =============================================================
-- Supabase migration: blog_comments (storefront blog comments)
-- Commenting REQUIRES login: a signed-in customer may post comments; everyone
-- can read. Mirrors product_reviews conventions (own-row RLS via auth.uid()).
-- author_name is denormalised because the users table is own-row-only
-- under RLS, so a public reader can't join to it for the name.
-- Apply by hand in the Supabase SQL Editor (service key can't run DDL).
-- Idempotent: safe to re-run.
-- =============================================================

CREATE TABLE IF NOT EXISTS blog_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id      UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name  TEXT NOT NULL DEFAULT '',          -- snapshot of the commenter's name
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_blog
  ON blog_comments (blog_id, created_at DESC);

-- =============================================================
-- Row Level Security
-- =============================================================
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. logged-out visitors) can read comments.
DROP POLICY IF EXISTS "Anyone can read blog comments" ON blog_comments;
CREATE POLICY "Anyone can read blog comments"
  ON blog_comments FOR SELECT
  USING (true);

-- A signed-in customer may post a comment owned by themselves.
DROP POLICY IF EXISTS "Customers can insert own comment" ON blog_comments;
CREATE POLICY "Customers can insert own comment"
  ON blog_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid())
  );

-- A customer may delete their own comment.
DROP POLICY IF EXISTS "Customers can delete own comment" ON blog_comments;
CREATE POLICY "Customers can delete own comment"
  ON blog_comments FOR DELETE
  USING (user_id = auth.uid());
