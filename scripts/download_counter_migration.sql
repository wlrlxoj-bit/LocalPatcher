-- 1. Add download_count column to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- 2. Create increment RPC function
CREATE OR REPLACE FUNCTION increment_game_download(game_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE games
  SET download_count = COALESCE(download_count, 0) + 1
  WHERE id = game_id;
END;
$$ LANGUAGE plpgsql;
