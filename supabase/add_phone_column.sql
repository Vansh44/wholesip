-- Add phone column to admins table
ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone TEXT;
