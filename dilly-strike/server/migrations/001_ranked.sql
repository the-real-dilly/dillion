-- Dilly Strike ranked mode (applied automatically by dilly-strike-server at boot,
-- tracked in dilly_schema_migrations; safe to run by hand with psql as well).

CREATE TABLE IF NOT EXISTS ranked_players (
    player_key    TEXT PRIMARY KEY,              -- lowercase hub callsign
    display_name  TEXT NOT NULL,
    rating        DOUBLE PRECISION NOT NULL DEFAULT 1500,   -- Glicko-2 rating (hidden MMR)
    rd            DOUBLE PRECISION NOT NULL DEFAULT 350,    -- rating deviation
    vol           DOUBLE PRECISION NOT NULL DEFAULT 0.06,   -- volatility
    rr            INTEGER NOT NULL DEFAULT 0,               -- visible rank rating
    placements    INTEGER NOT NULL DEFAULT 0,               -- ranked matches played (placement = first 5)
    wins          INTEGER NOT NULL DEFAULT 0,
    losses        INTEGER NOT NULL DEFAULT 0,
    draws         INTEGER NOT NULL DEFAULT 0,
    abandons      INTEGER NOT NULL DEFAULT 0,
    peak_rr       INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ranked_players_ladder ON ranked_players (rr DESC) WHERE placements >= 5;

CREATE TABLE IF NOT EXISTS ranked_matches (
    id          TEXT PRIMARY KEY,
    team_size   INTEGER NOT NULL,
    score_a     INTEGER NOT NULL,
    score_b     INTEGER NOT NULL,
    winner      TEXT,                   -- 'a' | 'b' | NULL (draw)
    rounds      INTEGER NOT NULL,
    overtime    BOOLEAN NOT NULL DEFAULT FALSE,
    forfeit     BOOLEAN NOT NULL DEFAULT FALSE,
    pod         TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS ranked_match_players (
    match_id          TEXT NOT NULL REFERENCES ranked_matches(id) ON DELETE CASCADE,
    player_key        TEXT NOT NULL,
    display_name      TEXT NOT NULL,
    team              TEXT NOT NULL,     -- 'a' | 'b'
    agent             TEXT NOT NULL,
    result            TEXT NOT NULL,     -- 'win' | 'loss' | 'draw'
    abandoned         BOOLEAN NOT NULL DEFAULT FALSE,
    kills             INTEGER NOT NULL DEFAULT 0,
    deaths            INTEGER NOT NULL DEFAULT 0,
    headshots         INTEGER NOT NULL DEFAULT 0,
    damage            INTEGER NOT NULL DEFAULT 0,
    mvps              INTEGER NOT NULL DEFAULT 0,
    rating_before     DOUBLE PRECISION NOT NULL,
    rating_after      DOUBLE PRECISION NOT NULL,
    rr_before         INTEGER NOT NULL,
    rr_after          INTEGER NOT NULL,
    rr_delta          INTEGER NOT NULL,
    placements_after  INTEGER NOT NULL,
    PRIMARY KEY (match_id, player_key)
);
CREATE INDEX IF NOT EXISTS idx_ranked_match_players_player ON ranked_match_players (player_key);
CREATE INDEX IF NOT EXISTS idx_ranked_matches_ended ON ranked_matches (ended_at DESC);
