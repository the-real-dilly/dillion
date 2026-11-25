# Dilly Gaming — High-Availability (HA) Kubernetes Stack

All three Rust WebSocket backends are configured for multi-replica High Availability using **PostgreSQL 16**, **Redis 7 Pub/Sub**, and **Kubernetes** (`Deployment` + `HPA` + `PDB` + `Ingress`).

## Services & Endpoints (`apibuild.dillonmay.com`)

| Game | Rust Service | Port | WebSocket Path | Redis Channel | PostgreSQL Tables |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Dillyverse** | `dillyverse-server` | `8080` | `wss://apibuild.dillonmay.com/` | `dilly:verse:events` | `dillyverse_blocks` |
| **Dilly Strike** | `dilly-strike-server` | `8081` | `wss://apibuild.dillonmay.com/strike` | `dilly:strike:events` | `dilly_strike_stats` |
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
