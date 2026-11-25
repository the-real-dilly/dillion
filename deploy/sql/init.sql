-- ============================================================================
-- DILLY GAMING HA PLATFORM — Shared PostgreSQL 16 Schema
-- Services: Dillyverse, Dilly Strike, Dilly Gone Mad
-- ============================================================================

CREATE TABLE IF NOT EXISTS dillyverse_blocks (
    seed TEXT NOT NULL,
    bx BIGINT NOT NULL,
    by BIGINT NOT NULL,
    bz BIGINT NOT NULL,
    block_id INTEGER NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (seed, bx, by, bz)
);
CREATE INDEX IF NOT EXISTS idx_dillyverse_blocks_seed ON dillyverse_blocks (seed);

CREATE TABLE IF NOT EXISTS dilly_strike_stats (
    callsign TEXT PRIMARY KEY,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    headshots INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dilly_mad_players (
    callsign TEXT PRIMARY KEY,
    last_x DOUBLE PRECISION DEFAULT 0,
    last_y DOUBLE PRECISION DEFAULT 0,
    last_z DOUBLE PRECISION DEFAULT 0,
    mode TEXT DEFAULT 'car',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dilly_mad_chat (
    id BIGSERIAL PRIMARY KEY,
    callsign TEXT NOT NULL,
    message TEXT NOT NULL,
    pod_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dilly_mad_chat_created ON dilly_mad_chat (created_at DESC);
