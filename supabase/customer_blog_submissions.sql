-- =============================================================
-- Supabase migration: Customer blog submissions
-- Adds support for customer-submitted blogs with moderation
-- =============================================================

-- 1. Add 'submitted_by' column to track which customer submitted the blog
--    (nullable — admin-created blogs won't have this)
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 2. Add 'is_customer_submission' flag to distinguish customer vs admin blogs
ALTER TABLE blogs
  ADD COLUMN IF NOT EXISTS is_customer_submission BOOLEAN NOT NULL DEFAULT false;

-- 3. Index for fast lookup of pending reviews
CREATE INDEX IF NOT EXISTS idx_blogs_pending_review
  ON blogs (status, created_at DESC)
  WHERE status = 'pending_review';

-- 4. Index for customer submissions lookup
CREATE INDEX IF NOT EXISTS idx_blogs_submitted_by
  ON blogs (submitted_by)
  WHERE submitted_by IS NOT NULL;

-- =============================================================
-- Row Level Security — Customer Policies
-- =============================================================

-- 5. Customers can INSERT blogs with status 'pending_review' and their own ID
CREATE POLICY "Customers can submit blogs for review"
  ON blogs FOR INSERT
  WITH CHECK (
    -- Must be an authenticated customer (exists in customers table)
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = auth.uid()
    )
    -- Must set status to pending_review
    AND status = 'pending_review'
    -- Must set submitted_by to their own ID
    AND submitted_by = auth.uid()
    -- Must mark as customer submission
    AND is_customer_submission = true
  );

-- 6. Customers can SELECT their own submissions (any status)
CREATE POLICY "Customers can read own submissions"
  ON blogs FOR SELECT
  USING (
    submitted_by = auth.uid()
    AND is_customer_submission = true
  );

-- 7. Customers can UPDATE their own pending submissions only
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
