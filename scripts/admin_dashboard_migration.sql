-- 1. Add popularity columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS popularity_index INTEGER DEFAULT 0;

-- 2. Update initial popular games based on slugs
UPDATE games SET is_popular = TRUE, popularity_index = 1 WHERE slug = 'elden-ring';
UPDATE games SET is_popular = TRUE, popularity_index = 2 WHERE slug = 'cyberpunk-2077-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 3 WHERE slug = 'palworld-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 4 WHERE slug = 'grand-theft-auto-v-trainer-1766066855';
UPDATE games SET is_popular = TRUE, popularity_index = 5 WHERE slug = 'red-dead-redemption-2-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 6 WHERE slug = 'monster-hunter-wilds-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 7 WHERE slug = 'hogwarts-legacy-trainers';
UPDATE games SET is_popular = TRUE, popularity_index = 8 WHERE slug = 'octopath-traveler-ii-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 9 WHERE slug = 'octopath-traveler';
UPDATE games SET is_popular = TRUE, popularity_index = 10 WHERE slug = 'hades-ii-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 11 WHERE slug = 'hades-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 12 WHERE slug = 'the-witcher-3-wild-hunt-trainer';
UPDATE games SET is_popular = TRUE, popularity_index = 13 WHERE slug = 'stellaris';
