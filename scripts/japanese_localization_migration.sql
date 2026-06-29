-- 1. Add translated_ja column to common_dictionary table
ALTER TABLE common_dictionary ADD COLUMN IF NOT EXISTS translated_ja TEXT;
