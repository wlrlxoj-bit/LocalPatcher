-- Add multi-language description columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS description_en text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description_ko text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description_ja text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description_de text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS description_es text;

