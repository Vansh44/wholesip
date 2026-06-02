-- =============================================================
-- Supabase migration: blogs table
-- Full CMS blog system with RLS
-- =============================================================

-- Create the blogs table
CREATE TABLE IF NOT EXISTS blogs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT,                          -- Stored as HTML (sanitised on render)
  cover_image_url TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  tags TEXT[] DEFAULT '{}',

  -- Extended fields
  category TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  seo_title TEXT,
  seo_description TEXT,
  reading_time INTEGER,                  -- Estimated minutes

  -- Audit fields
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast public listing (published blogs ordered by date)
CREATE INDEX IF NOT EXISTS idx_blogs_published
  ON blogs (status, published_at DESC)
  WHERE status = 'published';

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs (slug);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_blogs_category ON blogs (category)
  WHERE category IS NOT NULL;

-- Index for featured blogs
CREATE INDEX IF NOT EXISTS idx_blogs_featured ON blogs (featured)
  WHERE featured = true;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_blogs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blogs_updated_at_trigger
  BEFORE UPDATE ON blogs
  FOR EACH ROW
  EXECUTE FUNCTION update_blogs_updated_at();

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

-- 1. Public: anyone can read published blogs
CREATE POLICY "Public can read published blogs"
  ON blogs FOR SELECT
  USING (status = 'published');

-- 2. Admins can read ALL blogs (including drafts)
CREATE POLICY "Admins can read all blogs"
  ON blogs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'member')
    )
  );

-- 3. Admins can insert blogs
CREATE POLICY "Admins can insert blogs"
  ON blogs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'member')
    )
  );

-- 4. Admins can update blogs
CREATE POLICY "Admins can update blogs"
  ON blogs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'member')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'member')
    )
  );

-- 5. Admins can delete blogs
CREATE POLICY "Admins can delete blogs"
  ON blogs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'member')
    )
  );
