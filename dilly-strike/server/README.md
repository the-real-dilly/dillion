# Dilly Strike server: casual + ranked

This is a single zero-dependency Rust binary (`dilly-strike-server`, port 8081). It serves:

- **Casual online play** (`wss://…/strike`). This is the original drop-in server and it is unchanged.
- **Ranked** (`wss://…/strike/ranked`, plus HTTP `…/strike/ranked/*`). Any request path that contains `/ranked` goes to `src/ranked.rs`.

## Ranked at a glance

| Piece | Where | Summary |
| --- | --- | --- |
| Identity | `src/auth.rs` (and the copy in `dilly-hub/server/src/session.rs`) | The hub's `POST /api/auth/login` checks the PIN and returns a token: `v1.<b64url callsign>.<exp>.<HMAC-SHA256>`, valid for 7 days. The strike server checks that token with the same `DILLY_SESSION_SECRET`. Client-sent names are never trusted. |
| Matchmaking | `src/matchmaker.rs` | Each player's MMR window starts at `base` and grows by `growth`/s up to `max`. The longest-waiting player anchors the lobby, and every candidate must fit inside both the anchor's window and their own. Teams are split by exhaustive search for the smallest MMR gap. |
| Match rules | `src/game.rs` | Pure state machine: ready check → agent select (unique agent per team, only your own team's picks are visible) → buy → live → round end. First to 13. Sides swap after 12 rounds. Optional overtime at 12–12 (win by two, sides swap every round, capped, then a draw). The server runs the economy and checks buys. Damage comes from the server weapon table. There are fire-rate, range, movement-speed and map-bounds checks, and one charge per ability per round. |
| Rating | `src/rating.rs` | Glicko-2 hidden MMR (each match is one rating period against the enemy team as a composite opponent). The first 5 matches are placements with the rank hidden, then RR is seeded from MMR. After that, each match moves RR by a base ±18 plus a pull toward the RR your MMR implies, clamped to 8–35. Wins always gain RR and losses always cost RR. |
| Tiers | `src/rating.rs` | Seedling, Sprout, Gherkin, Dill, Brine, Kosher, Pickle Master (divisions I–III, 100 RR each), then Legend (2100+ RR, no cap). |
| Leavers / dodgers | `src/matchmaker.rs`, `src/game.rs`, `src/ranked.rs` | Declining or ignoring the ready check gives a cooldown that escalates 1×, 3×, 10×, 30× within 24h. Leaving agent select is a dodge: the match is cancelled, the dodger gets a cooldown and loses `RANKED_DODGE_RR`, and everyone else is re-queued with their original queue time. Disconnecting mid-match starts a reconnect grace period. If you don't return in time, or you are AFK or leave on purpose, that is an abandon: it counts as a loss even if your team wins, costs an extra `RANKED_LEAVER_RR`, and starts a cooldown that doubles each time. Teammates of a leaver lose only half the usual RR. If a whole team leaves, the other team wins by forfeit. |
| Abuse limits | `src/ranked.rs`, `src/util.rs` | Per-IP connection rate limit. Per-socket token-bucket message limit. Frames are capped at 4 KB and must be masked. A strict JSON parser rejects malformed input. Callsigns are validated. One live socket per account: a newer socket kicks the older one, across replicas too. |
| Persistence | `src/store.rs`, `migrations/` | PostgreSQL when `DATABASE_URL` is set. Migrations run at boot under an advisory lock and are tracked in `dilly_schema_migrations`. Without it, ratings are kept in memory (for tests and dev only, and a warning is logged). |
| Shared state | `src/queue.rs` | Redis when `REDIS_URL` is set: queue hash, queue heartbeats, matchmaker lease, player → match routing, cooldowns, offense counters. Without it, an in-memory backend is used and **only one replica works**. |
| Events | `src/ranked.rs` | Redis pub/sub. `dilly:strike:ranked` carries `ranked_match_found` and `ranked_match_end`. `dilly:strike:ranked:bus` is the internal relay between replicas. |

### How multiple replicas work
Every replica accepts ranked sockets. The replica that holds the matchmaker lease (`SET NX PX`, renewed with a compare-and-renew script) forms the lobbies and **hosts** those matches. Players connected to other replicas still play in them: their messages are published to the bus, the hosting replica processes them, and its replies are delivered by whichever replica holds each player's socket. This was tested with two local replicas sharing Redis and Postgres (`ranked_two_replicas_shared_redis`).

**Known limitation:** if the hosting replica dies mid-match, that match is lost and nobody's rating changes. The players' `active:` keys expire within 2 minutes and they can queue again. Matches are not migrated between replicas.

## Environment variables

| Var | Default | Meaning |
| --- | --- | --- |
| `DILLY_SESSION_SECRET` | *(unset → ranked disabled)* | At least 32 characters. Must be the **same value on the hub and the strike server**. Store it as a secret and never commit it. |
| `DATABASE_URL` / `REDIS_URL` | unset | Same as the other services. The PG client supports md5/cleartext auth only. |
| `RANKED_TEAM_SIZE` | `5` | Players per team, 1–5. Use `1` or `2` for testing or a small player base. |
| `RANKED_ROUNDS_TO_WIN` | `13` | Sides swap after `RANKED_ROUNDS_TO_WIN - 1` rounds. |
| `RANKED_OVERTIME` / `RANKED_MAX_OT_ROUNDS` | `1` / `6` | `0` means 12–12 ends as a draw. |
| `RANKED_OT_CREDITS` / `RANKED_START_CREDITS` | `5000` / `800` | Economy. Win +3000, loss +1900 (+500 per consecutive loss, up to 2), kill +200, cap 9000. |
| `RANKED_ACCEPT_SECS`, `RANKED_SELECT_SECS`, `RANKED_BUY_SECS`, `RANKED_ROUND_SECS`, `RANKED_ROUND_END_SECS` | 15, 30, 20, 100, 6 | Phase timers. Fractions are allowed. |
| `RANKED_RECONNECT_SECS`, `RANKED_AFK_SECS` | 90, 75 | Grace before a disconnect becomes an abandon, and the AFK limit during live rounds. |
| `RANKED_WINDOW_BASE`, `RANKED_WINDOW_GROWTH`, `RANKED_WINDOW_MAX` | 100, 8/s, 600 | MMR search window. Raise `BASE` when there are few players. |
| `RANKED_DECLINE_COOLDOWN_SECS`, `RANKED_LEAVER_COOLDOWN_SECS` | 60, 600 | Base cooldowns before escalation. |
| `RANKED_LEAVER_RR`, `RANKED_DODGE_RR` | 15, 5 | Extra RR penalties. |
| `RANKED_MSG_RATE`, `RANKED_MSG_BURST`, `RANKED_CONN_PER_IP_PER_MIN` | 40/s, 80, 30 | Rate limits. |
| `RANKED_TRUST_PROXY` | `0` | Set to `1` only behind your ingress, so the per-IP limit uses `X-Forwarded-For`. |

## Running locally

```bash
export DILLY_SESSION_SECRET=$(openssl rand -hex 32)
docker compose -f deploy/docker-compose.ha.yml up --build      # postgres, redis, hub :8083, strike :8081
# or without docker:
cargo run --manifest-path dilly-hub/server/Cargo.toml -- 8083 &
RANKED_TEAM_SIZE=1 RANKED_ROUNDS_TO_WIN=3 cargo run --manifest-path dilly-strike/server/Cargo.toml -- 8081 &
python3 -m http.server 8000
# open http://localhost:8000/dilly-strike/index.html?ranked=ws://localhost:8081/ranked&hub=http://localhost:8083
```
The static GitHub Pages site can't run this server. Its Ranked tab shows a "Ranked server unreachable" card when `wss://apibuild.dillonmay.com/strike/ranked` doesn't answer.

Migrations (`migrations/*.sql`) apply automatically when the server starts. To apply one by hand: `psql "$DATABASE_URL" -f dilly-strike/server/migrations/001_ranked.sql`. It is idempotent. Tables: `ranked_players`, `ranked_matches`, `ranked_match_players`.

## Tests

```bash
cd dilly-strike/server
cargo test                       # 40 unit tests + 3 end-to-end tests (real binary, headless WS clients, in-memory)
TEST_REDIS_URL=redis://:pw@127.0.0.1:6379 TEST_DATABASE_URL=postgres://u:pw@127.0.0.1:5432/db cargo test
                                 # also runs the Redis backend test + a 2-replica match persisted to Postgres
```

## Protocol (`/strike/ranked`, JSON text frames, `type` field)

Client → server:

| type | fields | when |
| --- | --- | --- |
| `hello` | `token` | must be the first frame, within 6 s |
| `queue` / `cancel` | – | join or leave matchmaking |
| `accept` / `decline` | – | ready check |
| `pick` / `lock` | `agent` (sprig, brine, vanta, ember, relay) | agent select |
| `buy` | `item`: `vandal`, `phantom`, `operator`, `sheriff`, `armor`, `util` | buy phase only |
| `state` | `x y z yaw pitch weapon` | about 20 Hz. Position is ignored during the buy phase |
| `hit` | `target` (player id), `weapon`, `hs` | live phase. Damage is computed by the server |
| `ability` | `kind` (`smoke`, `flash`, `dash`), `x z` | one per kind per round (`util` refills them) |
| `chat` | `text`, `team` | – |
| `abandon` | – | leave the match (counts as a loss) |
| `sync` / `ping` | – | full state resend / keepalive |

Server → client: `hello_ok {user,name,profile,cooldown_ms,in_match}`, `queue_status {queued,elapsed_ms,window,in_queue}`, `cooldown {cooldown_ms,reason}`, `match_found {match_id,accept_ms,total}`, `ready_update`, `match_cancelled {reason,requeued,penalized,cooldown_ms}`, `agent_select {team,side,allies[],enemies,left_ms}`, `match_start {players[],rounds_to_win,half,overtime}`, `round {phase,round,left_ms,score[a,b],side_a,ot,you{hp,armor,cash,weapons,alive,x,y,z,yaw},alive[]}`, `match_state` (full snapshot sent on reconnect), `state` (relayed movement), `damaged`, `hit_ok`, `kill {killer_id,victim_id,weapon,hs,…}`, `econ {cash,armor,weapons,abilities}`, `round_end {winner,reason,score,mvp,match_point,final}`, `halftime`, `smoke`, `flash`, `chat`, `correct {x,y,z}`, `player_conn`, `player_left`, `abandoned {cooldown_ms}`, `match_end {result,score,rank_before,rank_after,rr_delta,mmr_delta,promoted,demoted,revealed,players[]}`, `error {code,msg}`.

HTTP (CORS `*`, read-only): `GET /strike/ranked/status`, `GET /strike/ranked/leaderboard?limit=N` (placed players only), `GET /strike/ranked/profile/<callsign>` (rank plus the last 20 matches with per-match stats). Hidden MMR is never published.

## Honest gaps
- Hits are still detected on the client. The server checks weapon ownership, fire rate, range, that both players are alive and on opposite teams, and computes the damage itself. It does **not** trace line of sight against the map, and it trusts the client's `hs` flag. Positions are speed- and bounds-checked, but walls are not collision-checked.
- There is no bomb or objective yet. Rounds end on elimination, or on time (defenders win), the same as the existing solo loop.
- Parties and premade groups aren't supported: solo queue only.
- The hub PIN hash (`simple_hash`, FNV-1a) is weak and predates this work. Logins are now PIN-checked and throttled (8 failures per 10 min), but the hash should move to a proper KDF.
