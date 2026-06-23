-- =============================================================
-- Supabase migration: Customer blog submissions
-- Adds support for customer-submitted blogs with moderation.
--
-- Run this in the Supabase SQL Editor (it needs DDL privileges that the
-- service-role REST key does not have). Safe to re-run — every statement is
-- idempotent.
-- =============================================================

-- 1. Track which customer submitted the blog (nullable — admin-created blogs
--    won't have this).
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Flag to distinguish customer submissions from admin-authored blogs.
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS is_customer_submission BOOLEAN NOT NULL DEFAULT false;

-- 3. Index for fast lookup of pending reviews.
CREATE INDEX IF NOT EXISTS idx_blogs_pending_review
  ON blogs (status, created_at DESC)
  WHERE status = 'pending_review';

-- 4. Index for a customer's own submissions.
CREATE INDEX IF NOT EXISTS idx_blogs_submitted_by
  ON blogs (submitted_by)
  WHERE submitted_by IS NOT NULL;

-- =============================================================
-- Row Level Security — Customer Policies on `blogs`
-- (RLS is already enabled on blogs by blogs_table.sql.)
-- =============================================================

-- 5. Customers can INSERT blogs, but only as their own pending submission.
DROP POLICY IF EXISTS "Customers can submit blogs for review" ON blogs;
CREATE POLICY "Customers can submit blogs for review"
  ON blogs FOR INSERT
  WITH CHECK (
    -- Must be an authenticated customer (exists in users table)
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
    )
    -- Must set status to pending_review
    AND status = 'pending_review'
    -- Must set submitted_by to their own id
    AND submitted_by = auth.uid()
    -- Must mark as a customer submission
    AND is_customer_submission = true
  );

-- 6. Customers can SELECT their own submissions (any status).
DROP POLICY IF EXISTS "Customers can read own submissions" ON blogs;
CREATE POLICY "Customers can read own submissions"
  ON blogs FOR SELECT
  USING (
    submitted_by = auth.uid()
    AND is_customer_submission = true
  );

-- 7. Customers can UPDATE their own submissions only while pending review.
DROP POLICY IF EXISTS "Customers can edit own pending submissions" ON blogs;
CREATE POLICY "Customers can edit own pending submissions"
  ON blogs FOR UPDATE
  USING (
    submitted_by = auth.uid()
    AND is_customer_submission = true
    AND status = 'pending_review'
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND is_customer_submission = true
    AND status = 'pending_review'
  );

-- =============================================================
-- Storage RLS — let signed-in users upload blog cover images
-- The write editor uploads to the public `media` bucket under the
-- `blog-covers/` folder. Reads are already public (bucket is public);
-- only uploads (INSERT) need a policy for the `authenticated` role.
-- =============================================================

DROP POLICY IF EXISTS "Authenticated users can upload blog covers" ON storage.objects;
CREATE POLICY "Authenticated users can upload blog covers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'blog-covers'
  );
