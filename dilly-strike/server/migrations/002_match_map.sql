-- Dilly Strike ranked: record which map each match was played on.
-- Rows from before maps were per-match were all played on dustline.
ALTER TABLE ranked_matches ADD COLUMN IF NOT EXISTS map TEXT NOT NULL DEFAULT 'dustline';
CREATE INDEX IF NOT EXISTS idx_ranked_matches_map ON ranked_matches (map);
