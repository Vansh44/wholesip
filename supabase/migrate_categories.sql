-- Run this in your Supabase SQL Editor to migrate the blog table categories

-- 1. Rename the old column
ALTER TABLE blogs RENAME COLUMN category TO old_category;

-- 2. Add the new array column
ALTER TABLE blogs ADD COLUMN categories text[] DEFAULT '{}';

-- 3. Migrate existing data (if any)
UPDATE blogs 
SET categories = ARRAY[old_category] 
WHERE old_category IS NOT NULL;

-- 4. Drop the old column
ALTER TABLE blogs DROP COLUMN old_category;
