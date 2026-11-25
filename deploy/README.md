# Dilly Gaming — High-Availability (HA) Kubernetes Stack

All three Rust WebSocket backends are configured for multi-replica High Availability using **PostgreSQL 16**, **Redis 7 Pub/Sub**, and **Kubernetes** (`Deployment` + `HPA` + `PDB` + `Ingress`).

## Services & Endpoints (`apibuild.dillonmay.com`)

| Game | Rust Service | Port | WebSocket Path | Redis Channel | PostgreSQL Tables |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Dillyverse** | `dillyverse-server` | `8080` | `wss://apibuild.dillonmay.com/` | `dilly:verse:events` | `dillyverse_blocks` |
| **Dilly Strike** | `dilly-strike-server` | `8081` | `wss://apibuild.dillonmay.com/strike` (+ `/strike/ranked`) | `dilly:strike:events`, `dilly:strike:ranked` | `dilly_strike_stats`, `ranked_*` |
| **Dilly Gone Mad** | `dilly-gone-mad-server` | `8082` | `wss://apibuild.dillonmay.com/mad` | `dilly:mad:events` | `dilly_mad_players`, `dilly_mad_chat` |

## 1. Local HA Test (Docker Compose)
```bash
docker compose -f deploy/docker-compose.ha.yml up --build
```
Verify probes:
```bash
curl http://localhost:8080/healthz
curl http://localhost:8081/healthz
curl http://localhost:8082/healthz
```

## 2. Production Kubernetes Deployment
1. Build and push the three container images:
   ```bash
   docker build -t ghcr.io/the-real-dilly/dillyverse-server:latest dillyverse/server
   docker build -t ghcr.io/the-real-dilly/dilly-strike-server:latest dilly-strike/server
   docker build -t ghcr.io/the-real-dilly/dilly-gone-mad-server:latest dilly-gone-mad/server
   ```
2. Update the placeholder passwords in `deploy/k8s/secrets.yaml`.
3. Apply the manifests in order:
   ```bash
   kubectl apply -f deploy/k8s/namespace.yaml
   kubectl apply -f deploy/k8s/secrets.yaml
   kubectl apply -f deploy/k8s/postgres-ha.yaml
   kubectl apply -f deploy/k8s/redis-ha.yaml
   kubectl apply -f deploy/k8s/backends.yaml
   kubectl apply -f deploy/k8s/ingress.yaml
   ```

## 3. Dilly Strike Ranked

Ranked runs inside `dilly-strike-server` at `wss://apibuild.dillonmay.com/strike/ranked`, with HTTP endpoints `/strike/ranked/status|leaderboard|profile/<callsign>`. Players sign in with their Dilly Online Hub account. The hub (`POST /api/auth/login`) now checks the PIN and returns a signed session token, and the strike server verifies that token. **Both services need the same `DILLY_SESSION_SECRET`** (at least 32 random characters, kept in `dilly-ha-secrets`). If it is unset, ranked is disabled and casual play is unaffected.

```bash
export DILLY_SESSION_SECRET=$(openssl rand -hex 32)
RANKED_TEAM_SIZE=1 RANKED_ROUNDS_TO_WIN=3 docker compose -f deploy/docker-compose.ha.yml up --build   # 1v1 quick test
# open http://localhost:8000/dilly-strike/index.html?ranked=ws://localhost:8081/ranked&hub=http://localhost:8083
```

- **Migrations:** `dilly-strike/server/migrations/*.sql` are applied automatically at boot and tracked in `dilly_schema_migrations`. They create `ranked_players`, `ranked_matches` and `ranked_match_players`.
- **Redis:** the queue, matchmaker lease, match routing and cooldowns live under `dilly:ranked:*`, so all 3 replicas serve ranked. Match events are published on `dilly:strike:ranked`, and cross-replica relay goes over `dilly:strike:ranked:bus`.
- **Ingress:** the existing `/strike` rule already covers `/strike/ranked`. `RANKED_TRUST_PROXY=1` (set in `backends.yaml`) makes the per-IP rate limit use `X-Forwarded-For`.
- All ranked env vars, the wire protocol, and the known limits (for example, a match is lost if the replica hosting it dies) are documented in [`dilly-strike/server/README.md`](../dilly-strike/server/README.md).
