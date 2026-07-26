-- Add genres and tags columns to games table
ALTER TABLE "public"."games"
ADD COLUMN IF NOT EXISTS "genres" TEXT[] DEFAULT '{}'::TEXT[],
ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}'::TEXT[];
