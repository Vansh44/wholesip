-- =============================================================
-- Supabase migration: Customer blog DRAFTS
-- Lets a customer save a blog as a private draft and resume editing it later,
-- before submitting it for review. Extends the policies created in
-- customer_blog_submissions.sql to also permit the 'draft' status.
--
-- Run by hand in the Supabase SQL Editor (needs DDL/policy privileges the
-- service-role REST key lacks). Idempotent — safe to re-run.
-- =============================================================

-- INSERT: a customer may create their own row as either a private draft or a
-- pending submission (never directly published).
DROP POLICY IF EXISTS "Customers can submit blogs for review" ON blogs;
CREATE POLICY "Customers can submit blogs for review"
  ON blogs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM customers WHERE customers.id = auth.uid())
    AND status IN ('draft', 'pending_review')
    AND submitted_by = auth.uid()
    AND is_customer_submission = true
  );

-- UPDATE: a customer may edit their own row while it's a draft or pending, and
-- may move it between those two states (save draft ⇄ submit for review). The
-- WITH CHECK keeps them from flipping it to 'published' themselves.
DROP POLICY IF EXISTS "Customers can edit own pending submissions" ON blogs;
DROP POLICY IF EXISTS "Customers can edit own drafts and pending submissions" ON blogs;
CREATE POLICY "Customers can edit own drafts and pending submissions"
  ON blogs FOR UPDATE
  USING (
    submitted_by = auth.uid()
    AND is_customer_submission = true
    AND status IN ('draft', 'pending_review')
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND is_customer_submission = true
    AND status IN ('draft', 'pending_review')
  );

-- DELETE: a customer may delete (withdraw) their own draft or pending
-- submission. Published posts are not deletable by customers.
DROP POLICY IF EXISTS "Customers can delete own drafts and pending submissions" ON blogs;
CREATE POLICY "Customers can delete own drafts and pending submissions"
  ON blogs FOR DELETE
  USING (
    submitted_by = auth.uid()
    AND is_customer_submission = true
    AND status IN ('draft', 'pending_review')
  );
