-- =============================================================
-- Supabase migration: enquiries table
-- Storefront contact / enquiry submissions. The submitter's phone is
-- OTP-verified (Supabase phone auth) before insert; their email is captured
-- as typed and is NOT verified (per product spec).
--
-- Apply BY HAND in the Supabase SQL editor (the service key can't run DDL).
-- =============================================================

CREATE TABLE IF NOT EXISTS enquiries (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitter details
  name TEXT NOT NULL,
  email TEXT NOT NULL,                    -- user-supplied, unverified
  phone TEXT NOT NULL,                    -- OTP-verified client-side before insert
  subject TEXT,
  -- For "Other" enquiries, `subject` stores the literal "Other" and this holds
  -- the customer's free-text subject (shown only in the enquiry detail view).
  subject_detail TEXT,
  message TEXT NOT NULL,

  -- Dashboard inbox workflow
  status TEXT NOT NULL DEFAULT 'new',     -- 'new' | 'in_progress' | 'resolved' | 'archived'

  -- Reserved for future attribution. Enquiries are anonymous today (no login),
  -- so this is left NULL — the phone is OTP-verified client-side, not via a
  -- session.
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newest-first listing in the dashboard.
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries (created_at DESC);

-- Status filtering / inbox tabs.
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries (status);

-- Auto-update updated_at on row changes.
CREATE OR REPLACE FUNCTION update_enquiries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enquiries_updated_at_trigger
  BEFORE UPDATE ON enquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_enquiries_updated_at();

-- Back-fill for tables created before subject_detail existed (idempotent).
ALTER TABLE enquiries ADD COLUMN IF NOT EXISTS subject_detail TEXT;

-- =============================================================
-- Row Level Security
--
-- Enquiries are submitted ANONYMOUSLY (no login, no customer account): the
-- storefront server action inserts via the service-role admin client
-- (createAdminClient), and the dashboard reads / updates / deletes them the same
-- way. service_role bypasses RLS, so NO policies are granted to the anon or
-- authenticated roles — the table is reachable only through trusted server-side
-- (admin) code. Access is enforced at the app layer via
-- requireSectionAccess("enquiries", ...) / getManagerUserId("enquiries").
-- =============================================================

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: enquiries are personal contact data and must
-- never be readable client-side. All access goes through the admin client.
