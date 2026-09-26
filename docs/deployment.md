# Blendify — Production deployment runbook

This document is enough to recreate production from scratch. It covers the
topology, every dashboard setting, environment variables, the deploy and
migration workflow, smoke tests, and rollback.

Guest transfer is enabled in production: `GUEST_TRANSFER_ENABLED=true`. The
variable stays in place as a kill switch (see
[Guest transfer gate](#16-guest-transfer-gate)).

## 1. Topology

```
browser ──► Cloudflare (Workers static assets) ─────────► https://blendify.camilasabino.dev
browser ──► Railway edge (TLS, Let's Encrypt) ─► NestJS ─► https://api.blendify.camilasabino.dev
                                                  │
                                                  └─ Railway private network ─► PostgreSQL, Redis
```

| Piece | Where | Notes |
|---|---|---|
| Web SPA | Cloudflare Workers static assets (`apps/web/wrangler.jsonc`) | Custom domain `blendify.camilasabino.dev`, SPA fallback |
| API | Railway service `api` (Infrastructure as Code: `.railway/railway.ts`), Hobby plan, 1 replica | Custom domain `api.blendify.camilasabino.dev`, **DNS-only** |
| PostgreSQL | Railway `postgres` database (`.railway/railway.ts`) | Private network only; backups by manual `pg_dump` (section 7) |
| Redis | Railway `redis` database (`.railway/railway.ts`) | Private network only, `noeviction`, no persistence |

Decisions:

- The API is **not** proxied through Cloudflare. Cloudflare Universal SSL covers
  one subdomain level only (`*.camilasabino.dev`), so it cannot terminate
  `api.blendify.camilasabino.dev` without Advanced Certificate Manager, and a
  second proxy would change the client-IP chain (see [client IP](#5-client-ip-client_ip_source-and-trust_proxy)).
- The browser calls the API origin directly with `credentials: 'include'`.
- A future private service (for example a Python AI service) can join the
  same Railway project and be reached over `*.railway.internal` without a
  public domain.

## 2. DNS (Cloudflare zone `camilasabino.dev`)

| Name | Type | Target | Proxy |
|---|---|---|---|
| `blendify` | Created automatically by the Worker custom domain | Worker `blendify-web` | Proxied |
| `api.blendify` | `CNAME` | Target shown by Railway for the custom domain | **DNS only** |
| Railway verification record, if Railway shows one | `TXT` | Value shown by Railway | DNS only |

The existing `camilasabino.dev` site is not changed.

## 3. Frontend (Cloudflare Workers static assets)

Repository config: `apps/web/wrangler.jsonc`

- `assets.directory: ./dist`, `not_found_handling: single-page-application`
  (every client route such as `/app/discover` or `/privacy` returns
  `index.html` with 200).
- `routes: [{ pattern: blendify.camilasabino.dev, custom_domain: true }]`.
- `workers_dev: false`, `preview_urls: false`: the custom domain is the only
  public origin, which must match `FRONTEND_URL` exactly.

Security headers: `apps/web/public/_headers` (copied to `dist/_headers`):

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `frame-ancestors 'none'` (framing only; no resource allowlist) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cache-Control` on `/assets/*` | `public, max-age=31536000, immutable` (hashed Vite assets) |

A full resource CSP is intentionally not set: it would need an inventory of
Spotify image hosts, Google Fonts, and the API origin, tested end to end.

### 3.1 How the live frontend is deployed (Wrangler CLI)

Workers Builds is **not** connected for `blendify-web`. The production Worker
is uploaded from a local clean checkout:

```sh
nvm use                      # Node 22 from .nvmrc
npm ci
VITE_API_URL=https://api.blendify.camilasabino.dev npm run build:web
npx wrangler@4 deploy --config apps/web/wrangler.jsonc
```

The uploaded version records `source: wrangler` and
`workers/triggered_by: upload` in its Cloudflare metadata, with the commit
short SHA as the deploy message. There is no push-to-deploy for the SPA:
every frontend release is a deliberate manual deploy.

Standardizing this as GitHub Actions + Wrangler across the author's projects
is a follow-up, not part of this milestone.

### 3.2 Workers Builds (not active; reference for a future switch)

| Setting | Value |
|---|---|
| Repository / branch | `camilasabino/Blendify` / `main` |
| Root directory | `/` (repository root, needed for npm workspaces) |
| Build command | `npm ci && npm run build:web` |
| Deploy command | `npx wrangler@4 deploy --config apps/web/wrangler.jsonc` |
| Build watch paths | `apps/web/**`, `packages/contracts/**`, `package.json`, `package-lock.json`, `.nvmrc` |
| Build variable | `VITE_API_URL=https://api.blendify.camilasabino.dev` |
| Node version | from `.nvmrc` (22) |

### 3.3 HTTP → HTTPS (pending manual Cloudflare task)

`http://blendify.camilasabino.dev/` currently answers `200` instead of
redirecting. The intended fix is a **scoped** Redirect Rule on the zone:

| Field | Value |
|---|---|
| When incoming requests match | `(http.host eq "blendify.camilasabino.dev" and not ssl)` |
| Target URL (dynamic) | `concat("https://blendify.camilasabino.dev", http.request.uri)` |
| Status | `301` |
| Preserve query string | enabled |

Zone-wide "Always Use HTTPS" must stay **off**: it would change unrelated
`camilasabino.dev` traffic. The Wrangler OAuth credentials only hold
`zone:read`, so Redirect Rules cannot be created from the CLI; this is a
dashboard action.

`VITE_API_URL` is a **build** variable, not a runtime variable: Vite compiles
it into the bundle. A production build fails when it is missing, not an
absolute origin (no path, query or trailing slash), or not `https` (plain
`http` is accepted only for `127.0.0.1` / `[::1]` local builds)
(`apps/web/config/api-url.ts`). It is the only `VITE_*` variable; never put a
secret in a `VITE_*` variable.

## 4. API (Railway)

### 4.1 Infrastructure as Code (`.railway/railway.ts`)

Railway Config as Code (`railway.json` / `railway.toml`) is deprecated: new
services cannot opt into it and it stops being read on 2026-12-01. Blendify
uses Railway **Infrastructure as Code** instead. `.railway/railway.ts`
(authored with the `railway/iac` entrypoint of the `railway` npm package,
pinned as a root devDependency) declares:

| Resource | Declared settings |
|---|---|
| `postgres` | Railway PostgreSQL database (`postgres()` helper) |
| `redis` | Railway Redis database (`redis()` helper) |
| `api` | Source `github("camilasabino/Blendify", { branch: "main" })`, repository root as build context; builder `RAILPACK`; build `npm run build:api`; watch patterns `apps/api/**`, `packages/contracts/**`, `package.json`, `package-lock.json`, `.nvmrc`; pre-deploy `npm run prisma:deploy -w @blendify/api`; start `npm run start:prod -w @blendify/api`; health check `/api/health`, timeout 120 s; 1 replica; restart `ON_FAILURE` (5 retries); `RAILPACK_NODE_NPM_INSTALL=npm ci`; `PORT=8080`; non-secret variables; `DATABASE_URL`/`REDIS_URL` as typed references to the databases; secrets as `preserve()` |

`PORT=8080` is set explicitly; when adding the custom domain in the
dashboard, target port 8080 so the domain and the port Nest listens on match.

Settings the IaC helpers cannot represent cleanly are dashboard
configuration (see the sections referenced):

- Custom domain `api.blendify.camilasabino.dev` (target port 8080):
  `railway config plan` rejects custom-domain registration ("Custom-domain
  registration is not supported by Railway configuration. Add … in the
  dashboard, then run railway config pull"). Add it in the dashboard. Railway
  suggests `railway config pull` afterwards; it rewrites the authoring file,
  so run it only on a clean working tree and review the diff before keeping
  it (or keep the file unchanged if `plan` shows no removal of the domain).

- Redis start command and memory limit (`redis()` accepts only a region) —
  applied through Railway's Public GraphQL API, see [Redis](#6-redis).
- PostgreSQL volume size (`postgres()` exposes no volume options) — applied
  through the same API, see
  [PostgreSQL](#7-postgresql-prisma-migrations-and-backups).
- Secret values (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `JWT_SECRET`,
  `LASTFM_API_KEY`): declared with `preserve()`, so IaC never writes or
  prints them; set them once in the dashboard (sealed).
- The generated `*.up.railway.app` service domain, used temporarily for the
  first smoke tests.

Validation and workflow (Railway CLI ≥ 5.42.1, logged in, run from the
repository root linked to the project):

```sh
npm run check:railway   # offline: type-checks .railway/railway.ts against railway/iac
railway link            # link the repository to the Railway project
railway config plan     # read-only: diff of desired vs live environment
railway config apply    # applies after confirmation; destructive changes need extra confirmation
```

Never apply a plan that deletes resources or variables you did not intend to
remove. `plan` compares the file with the *live* environment, so review it
before every apply, especially after dashboard-only changes.

### 4.2 Configuration outside IaC: staged changes through the Public GraphQL API

`railway environment edit --service-config …` returned "No changes to apply"
for these settings (the staged patch stayed empty), so they were applied
with Railway's Public GraphQL API through the CLI (`railway api`), using the
environment config paths defined by Railway's official schema
(`https://backboard.railway.com/schema/environment.schema.json`):

1. `environmentStageChanges(environmentId, input, merge: true)` with an
   `EnvironmentConfig` patch, for example
   `services.<redis service id>.deploy.startCommand`,
   `services.<redis service id>.deploy.limitOverride.containers.memoryBytes`,
   `volumes.<postgres volume id>.sizeMB`.
2. `environmentStagedChanges(environmentId)` to review the staged patch; it
   must contain only the intended service.
3. `environmentPatchCommitStaged(environmentId, commitMessage)` to commit
   once (one deploy of the affected service).

Resolve the IDs with `railway environment config --json` (read-only) at the
time of the change; they are intentionally not recorded here. The dashboard
(service → Settings / Backups) is an equivalent alternative.

### 4.3 IaC drift and the apply rule

The live environment intentionally differs from `.railway/railway.ts` in two
places. `railway config plan` currently reports:

| Plan line | Why | Action |
|---|---|---|
| `redis deploy.limitOverride.containers.memoryBytes (536870912 → null)` | The Redis 512 MiB memory cap was applied outside IaC; the `redis()` helper cannot represent it. | **Accepted external/manual configuration boundary.** Applying this plan would remove the cap. |
| `api deploy.restartPolicyType (null → "ON_FAILURE")` | Railway stores the default policy as `null` (retries stay at 5); it reappears after every apply. | Known and harmless; review it in every plan. |

**Operational rule:** never run `railway config apply` without reviewing the
plan. If the plan proposes removing the Redis 512 MiB limit (or any other
setting listed in section 4.2), do not apply it. The live Redis memory cap
must stay 512 MiB unless it is changed intentionally.

### 4.4 First-time setup

1. Create an empty Railway project and link the repository:
   `railway init --name Blendify --workspace "<workspace>"` (creates the
   project and links the current directory to its `production` environment).
   Make sure the Railway GitHub app can access `camilasabino/Blendify`, and
   that `main` already contains `.railway/railway.ts` and the `build:api`
   script before applying (the created service deploys `main`).
2. `railway config plan`, review, then `railway config apply`: creates
   `postgres`, `redis`, and `api` with the settings above.
3. In the dashboard, set the four preserved secrets on `api` (sealed).
   Apply every staged variable change: a deploy triggered by the first
   applied variable does not pick up variables added afterwards.
4. Configure Redis ([section 6](#6-redis)) and the PostgreSQL volume size
   ([section 7](#7-postgresql-prisma-migrations-and-backups)) as in
   section 4.2.
5. Generate a temporary `*.up.railway.app` domain for `api` if needed for
   the first checks.
6. Dashboard → `api` → Networking → add custom domain
   `api.blendify.camilasabino.dev` (port 8080). Create the `CNAME` (DNS only)
   with the target Railway shows, and wait for the certificate.
7. Run `railway config plan` again: it must show only the known drift of
   section 4.3. If it proposes removing the generated domain or any setting
   applied outside IaC, do not apply those changes.
8. After the custom-domain and client-IP smoke tests pass (section 13),
   remove the generated domain.

### Build and start

| Phase | Command |
|---|---|
| Install | `npm ci` (`RAILPACK_NODE_NPM_INSTALL=npm ci`; without it Railpack runs `npm install`) |
| Build | `npm run build:api` = contracts `tsc` → `prisma generate` → `nest build` |
| Pre-deploy | `npm run prisma:deploy -w @blendify/api` (`prisma migrate deploy`) |
| Start | `npm run start:prod -w @blendify/api` (`node dist/main`) |
| Health check | `GET /api/health` (timeout 120 s) |

- `dist/` is never committed; every build compiles `@blendify/contracts`
  from source before the API, so no stale local `dist` can leak in.
- `prisma` is a devDependency used by the pre-deploy command. Do not enable
  dev-dependency pruning in Railpack.
- The API listens on `PORT` (8080, set in IaC).
- `enableShutdownHooks()` closes the HTTP server, Prisma and Redis on
  `SIGTERM` during redeploys. In-flight generations that outlive the drain are
  cut; their concurrency permits expire after the 30 s lease.

### 4.5 Health check semantics

`GET /api/health` returns:

- `200 {"status":"ok","database":"up"}` when PostgreSQL answers `SELECT 1`;
- `503 {"status":"unavailable","database":"down"}` otherwise.

Redis, Spotify, Last.fm, and Soundiiz are deliberately not checked: a
temporary outage of an optional dependency must not block a deploy. Railway
uses the health check only during deploys (new version receives traffic after
the first `2xx`).

### 4.6 Railway SSH

`railway ssh -s <service> -- <command>` runs commands inside a service
without any public networking; it is how Redis and PostgreSQL settings are
verified. It authenticates with an explicitly registered public key:

```sh
railway ssh keys add --key ~/.ssh/id_ed25519.pub --name "Camila Mac"
```

On first use, OpenSSH must trust the SSH gateway host (`ssh.railway.com`).
Verify the host key when adding it to `known_hosts` (for example compare the
fingerprint from `ssh-keyscan ssh.railway.com | ssh-keygen -lf -` against a
second, independent network or Railway's documentation); do not treat a
fingerprint copied from an earlier session as permanently trusted. Never add
private key material to the repository or to logs.

### 4.7 Cost controls

- Workspace plan: **Hobby**.
- Workspace usage limits (`railway usage limit status`): soft alert
  **USD 5**, hard limit **USD 15**, set with
  `railway usage limit set --target workspace --soft 5 --hard 15`.
- The hard limit **intentionally stops workloads** when it is reached; raise
  it deliberately before it becomes a production outage.
- The separate Railway Agent limit is not part of this configuration.

### 4.8 Current production state (Railway, `production`)

| Service | State |
|---|---|
| `api` | Railpack with `npm ci`, Node 22, 1 replica, `PORT=8080`, private connections to PostgreSQL and Redis, custom domain `api.blendify.camilasabino.dev` **ACTIVE** on port 8080 (the generated Railway domain was removed), `/api/health` 200, `CLIENT_IP_SOURCE=railway-x-forwarded-for`, `GUEST_TRANSFER_ENABLED=true`, `CLIENT_IP_DIAGNOSTICS` not set |
| `postgres` | PostgreSQL 18.6, 5 GB volume, private networking only (no public domain, no public TCP proxy), no Railway backups or PITR on Hobby; backups by manual `pg_dump` (section 7) |
| `redis` | 512 MiB container memory limit, `maxmemory` 256 MiB, `noeviction`, RDB and AOF disabled, authenticated, private networking only (no public domain, no public TCP proxy) |

### 4.9 Automatic deploys (GitHub trigger)

There is exactly **one** deployment trigger for production, and it is the only
supported way the API reaches production:

| Field | Value |
|---|---|
| Provider | `github` |
| Repository | `camilasabino/Blendify` |
| Branch | `main` |
| Service / environment | `api` / `production` |
| Wait for CI (`checkSuites`) | `true` |

A push to `main` therefore waits for the GitHub check suites and deploys only
when they pass. A commit that touches nothing under the service watch patterns
(`apps/api/**`, `packages/contracts/**`, `package.json`,
`package-lock.json`, `.nvmrc`) is recorded as `SKIPPED` with
`"No changes to watched files"` — that is correct behavior for docs-only or
`.railway/`-only commits, not a broken trigger. Do not create a second
trigger and do not widen the watch patterns to force a deploy; use
`railway deployment redeploy` when a rebuild of unchanged sources is needed.

Read the current trigger state with:

```sh
railway api 'query { project(id: "<projectId>") { deploymentTriggers { edges { node { id branch provider repository checkSuites serviceId environmentId } } } } }'
```

## 5. Client IP, `CLIENT_IP_SOURCE` and `TRUST_PROXY`

Rate limits and generation concurrency key anonymous callers by client IP
(authenticated callers by user ID). Two settings are involved, and they are
separate concerns:

- `CLIENT_IP_SOURCE` selects where the anonymous client IP comes from.
- `TRUST_PROXY` only configures Express proxy trust (`req.ip`,
  `req.protocol`); in production it is no longer used for client identity.

Measured on Railway public networking (first on a temporary
`*.up.railway.app` domain with hashed diagnostics, then re-verified on the
final `api.blendify.camilasabino.dev` custom domain; Wi-Fi and cellular
clients, HTTP/1.1 and HTTP/2):

| Signal | Observed |
|---|---|
| `X-Forwarded-For` | Always two entries: `[client, Railway edge proxy]`. Client-supplied values are discarded by the edge. |
| `X-Forwarded-For[0]` | The real client IP, stable across new and reused connections |
| `X-Forwarded-For[1]` (= `req.ip` with `TRUST_PROXY=1`) | A Railway edge-proxy address from a small per-region pool; varies between connections |
| Socket peer | Another internal address that changes per connection |
| `X-Real-IP` | Overwritten by the edge with the real client IP |

With `TRUST_PROXY=1` alone, one client was split across several limiter
identities, so opening new connections bypassed the limits.

Production therefore sets `CLIENT_IP_SOURCE=railway-x-forwarded-for`:

- the identity is the **left-most** `X-Forwarded-For` entry, trimmed and
  normalized; the entry count and the proxy chain are not walked;
- a missing, empty, or invalid first entry maps to one shared `unknown`
  identity and logs `request_limit.invalid_client_ip` (throttled); there is
  no fallback to `req.ip` or the socket address;
- `TRUST_PROXY` stays `1`. `TRUST_PROXY=true` is rejected at startup; `false`
  is rejected in production. `CLIENT_IP_SOURCE` is required in production
  (`express` or `railway-x-forwarded-for`); outside production it defaults to
  `express`.

Assumptions and limits:

- The API is reachable publicly only through the Railway edge (generated
  domain or DNS-only custom domain), which rewrites `X-Forwarded-For`.
- Private network: another service in the same Railway project could reach
  the API without the edge and set `X-Forwarded-For`. Only our own services
  run there, and they must not call public endpoints.
- Re-run the client-IP smoke test (section 13) after any networking change,
  including adding the custom domain.

Empirical result on the final custom domain: one client, repeated requests
over separate connections and over one reused HTTP/2 connection, consumed a
single limiter bucket; forged `X-Forwarded-For` (single and multi-entry) and
forged `X-Real-IP` did not create a fresh identity; every
`request_limit.rejected` line carried the same identity hash. A client on a
different network got its own bucket, and the hash matched
`sha256("ip:<public IP>")` truncated to 12 characters.

If the API is ever proxied through Cloudflare, revisit this section: the
left-most entry would no longer be written by the Railway edge alone.

## 6. Redis

Used for fixed-window rate limits, generation concurrency leases, and the
search/catalog cache. Every limiter and cache key has a TTL, so any
`volatile-*` or `allkeys-*` eviction policy could silently drop live limiter
counters or leases. The only safe policy is `noeviction`.

Live configuration (applied as in section 4.2, because the `redis()` IaC
helper represents neither the start command nor the memory limit):

| Setting | Value |
|---|---|
| Railway service memory limit | 512 MiB (`deploy.limitOverride.containers.memoryBytes = 536870912`) |
| `maxmemory` | 256 MiB (`268435456`), about 50 % of the limit, leaving room for allocator fragmentation, client buffers, and the modules bundled with Redis 8 |
| `maxmemory-policy` | `noeviction` |
| `save` | empty (RDB disabled) |
| `appendonly` | `no` (AOF disabled) |
| Networking | private only, password-authenticated (`REDIS_PASSWORD`, used by `REDIS_URL`) |

The start command keeps the Railway template bootstrap (volume cleanup,
image entrypoint, `--requirepass $REDIS_PASSWORD`, data directory) and only
replaces the persistence flags and adds the memory settings:

```sh
/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save '' --appendonly no --maxmemory 256mb --maxmemory-policy noeviction --dir $RAILWAY_VOLUME_MOUNT_PATH"
```

(The template's original command used `--save 60 1`, i.e. RDB snapshots.)
The `redis-volume` stays attached because the database helper owns it, but
nothing is persisted to it.

Verify through Railway SSH (never print the password):

```sh
railway ssh -s redis -- sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory; redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET maxmemory-policy; redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET save; redis-cli -a "$REDIS_PASSWORD" --no-auth-warning CONFIG GET appendonly; cat /sys/fs/cgroup/memory.max'
```

Expected: `268435456`, `noeviction`, empty `save`, `appendonly no`,
`536870912`. An unauthenticated `redis-cli PING` must answer `NOAUTH`.
When Redis restarts, the API logs `Redis error: connect ETIMEDOUT` and
reconnects on its own within seconds.

Behavior at the limit: writes fail with `OOM`. The cache falls back to
process memory; `search` and `similar` stay available (fail-open);
`resolve`, generation, generation concurrency, and `transfer` return
`503 SERVICE_UNAVAILABLE` (fail-closed). Watch `used_memory` and the
`request_limit.store_unavailable` warnings; if the cache ever crowds the
limiter out, move the limiter to its own Redis instance.

Persistence is not required: a restart only resets rate-limit windows and
leases and empties the cache.

Connection: `REDIS_URL` references `redis.env.REDIS_URL` in IaC (private host, no TLS on the
WireGuard private network). One ioredis client per API instance. If ioredis
cannot resolve the private host (IPv6-only private DNS in older Railway
environments), append `?family=0` to `REDIS_URL`.

## 7. PostgreSQL, Prisma migrations and backups

- `DATABASE_URL` references `postgres.env.DATABASE_URL` in IaC (private host).
- Production runs **PostgreSQL 18.6** (Railway `postgres()` helper); local
  development uses PostgreSQL 16 (Docker Compose). The single migration
  applied cleanly on 18.6; keep new migrations portable across both.
- Current state: 5 GB volume, private networking only (no public TCP proxy),
  Railway Hobby plan, no Railway volume backups, PITR unavailable.
- **Resizing:** in this project, resizing `postgres-volume` from 500 MB to
  5 GB restarted the PostgreSQL service (even with deploys skipped on the
  commit). Treat future production resizes as potentially disruptive and do
  them in a controlled window.
- Migrations run only through `prisma migrate deploy` in Railway's
  pre-deploy command: once per deploy, in a separate container, before the
  new version receives traffic. A failing migration aborts the deploy and the
  previous version keeps serving.
- Never run `prisma migrate dev`, `prisma db push`, or `prisma migrate reset`
  against production.
- **Expand/contract:** the previous version keeps serving while the
  pre-deploy runs, so every migration must be compatible with the currently
  deployed code. Add columns/tables first (nullable or with defaults), deploy
  code that uses them, and remove old columns in a later release.
- There are no down migrations. Recovery from a bad migration is a forward
  fix or a restore.

### Backups

On this account the Railway dashboard (`postgres` → Backups) states:
"Creating backups and enabling point-in-time recovery (PITR) are only
available for customers on the Pro plan." The workspace is on **Hobby**, so
there are **no scheduled volume backups, no manual Railway volume backups,
and no PITR**. Backups are logical dumps taken from a local machine.

#### Required: dump before any deploy that contains a migration

Run this before pushing any change that adds a Prisma migration (the
pre-deploy runs `prisma migrate deploy` automatically). Requirements: Railway
CLI logged in and linked to the project, and a local `pg_dump` whose major
version is **≥ 18** (the server runs PostgreSQL 18.6).

1. Terminal 1 — open a private tunnel over Railway SSH (no public TCP proxy is
   created; it stays open until Ctrl+C):

   ```sh
   railway connect postgres --tunnel-only --port 55432
   ```

2. Terminal 2 — dump in custom format to a directory outside the repository
   and outside Railway. `railway run -s postgres` injects `PGUSER`,
   `PGPASSWORD` and `PGDATABASE` from the `postgres` service into the command
   without printing them:

   ```sh
   mkdir -p "$HOME/Backups/blendify"
   railway run -s postgres -- sh -c 'pg_dump \
     --host=127.0.0.1 --port=55432 \
     --username="$PGUSER" --dbname="$PGDATABASE" \
     --format=custom --no-owner \
     --file="$HOME/Backups/blendify/blendify-prod-$(date -u +%Y%m%dT%H%M%SZ).dump"'
   ```

3. Verify the dump is non-empty and readable:

   ```sh
   DUMP="$(ls -t "$HOME"/Backups/blendify/blendify-prod-*.dump | head -1)"
   test -s "$DUMP" && ls -lh "$DUMP"
   pg_restore --list "$DUMP" | grep -E 'TABLE DATA public (users|playlists|seed_usages|user_usage_stats|_prisma_migrations)'
   ```

4. Only then push the change that triggers `prisma migrate deploy`.
5. Close the tunnel (Ctrl+C in terminal 1).

Dumps contain account data and Spotify tokens: keep them in a private,
backed-up location, never in the repository, and delete old ones when no
longer needed. Never paste `railway run … printenv` output anywhere.

#### Restore drill (never against production)

Verifies that a dump is actually restorable. Do it before the initial public
release, periodically afterwards, and whenever the backup procedure changes.
It uses a disposable local PostgreSQL 18 container:

```sh
docker run --rm -d --name blendify-restore-drill \
  -e POSTGRES_PASSWORD=restore-drill -p 55433:5432 postgres:18
sleep 5
export PGPASSWORD=restore-drill
createdb --host=127.0.0.1 --port=55433 --username=postgres restore_drill
pg_restore --host=127.0.0.1 --port=55433 --username=postgres \
  --dbname=restore_drill --no-owner --exit-on-error "$DUMP"
psql --host=127.0.0.1 --port=55433 --username=postgres --dbname=restore_drill \
  -c 'SELECT migration_name FROM _prisma_migrations;' \
  -c 'SELECT count(*) AS users FROM users;'
unset PGPASSWORD
docker rm -f blendify-restore-drill
```

The restored database must contain every applied migration and plausible row
counts. Restoring into production is not part of the drill; a real restore
is a separate, deliberate recovery operation.

#### Future upgrade path (not part of M10)

If Blendify later stores data whose loss has a higher impact, options are:

- Railway **Pro**, for native volume backups and PITR;
- an automated offsite `pg_dump` (a scheduled Railway service that writes
  dumps to external object storage).

Redis needs no persistence or backups: it holds only cache, rate-limit and
concurrency state.

Losing data costs users a re-login and their Library/Stats history.

## 8. Environment variables

Non-secret API variables are declared in `.railway/railway.ts`. Secrets are
set in Railway service variables (sealed) and declared there with
`preserve()`. The web variable is a Cloudflare build variable. No secret value belongs in the repository.

### 8.1 Frontend (Cloudflare build variables)

| Variable | Required | Secret | Value |
|---|---|---|---|
| `VITE_API_URL` | Yes (build fails otherwise) | No, public | `https://api.blendify.camilasabino.dev` |

### 8.2 API non-secret configuration (Railway)

| Variable | Required | Production value / notes |
|---|---|---|
| `NODE_ENV` | Yes | `production` (enables validation, fail-closed limits, disables Swagger) |
| `PORT` | Yes | `8080` (set in IaC; matches the custom-domain port) |
| `FRONTEND_URL` | Yes | `https://blendify.camilasabino.dev` — https origin, no trailing slash; drives CORS, the origin/CSRF guard, and OAuth redirects |
| `SPOTIFY_CLIENT_ID` | Yes | Server-side only |
| `SPOTIFY_REDIRECT_URI` | Yes | `https://api.blendify.camilasabino.dev/api/auth/spotify/callback` |
| `SPOTIFY_SCOPES` | Yes | `user-read-email user-read-private playlist-read-private playlist-modify-public playlist-modify-private ugc-image-upload user-read-playback-state user-modify-playback-state` |
| `SPOTIFY_CATALOG_MARKET` | Yes | ISO 3166-1 alpha-2, for example `AR` |
| `TRUST_PROXY` | Yes | `1` (Express proxy trust; see section 5) |
| `CLIENT_IP_SOURCE` | Yes | `railway-x-forwarded-for` (anonymous client identity; see section 5) |
| `RATE_LIMIT_OVERRIDES` | No | Unset (code defaults) |
| `GENERATION_CONCURRENCY_PER_CLIENT` | No | Unset (default 2) |
| `GENERATION_CONCURRENCY_GLOBAL` | No | Unset (default 6) |

### 8.3 API secrets (Railway)

| Variable | Required | Notes |
|---|---|---|
| `SPOTIFY_CLIENT_SECRET` | Yes | Never exposed to the web app |
| `JWT_SECRET` | Yes | ≥ 32 random characters (`openssl rand -base64 48`). Signs session JWTs and derives the transfer-token key; rotating it signs everyone out and invalidates transfer tokens |
| `LASTFM_API_KEY` | Yes | Required for Discover and similar-artist features |

### 8.4 Data stores (Railway references)

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | Yes | IaC reference `postgres.env.DATABASE_URL` |
| `REDIS_URL` | Yes | IaC reference `redis.env.REDIS_URL` |

### 8.5 Feature gates

| Variable | Required | Production value |
|---|---|---|
| `GUEST_TRANSFER_ENABLED` | Set explicitly | `true` |

### 8.6 Startup validation

With `NODE_ENV=production` the API refuses to start
(`apps/api/src/config/production-environment.ts`) when:

- any variable marked required above is missing or blank;
- `FRONTEND_URL` is not an `https` origin without path or trailing slash;
- `SPOTIFY_REDIRECT_URI` is not `https`;
- `JWT_SECRET` is shorter than 32 characters or equals the example value;
- `TRUST_PROXY` is `false`/`0` or invalid (`true` is always rejected);
- `CLIENT_IP_SOURCE` is not `express` or `railway-x-forwarded-for`;
- a removed variable is still set: `JWT_EXPIRES_IN`, `COOKIE_SECRET`, `API_URL`.

The session lifetime is fixed at 7 days in code: the JWT `exp` and the cookie
`maxAge` share one constant (`SESSION_TTL_SECONDS`).

### 8.7 Local development

| Variable | Local value |
|---|---|
| `FRONTEND_URL` | `http://127.0.0.1:5173` |
| `VITE_API_URL` | `http://127.0.0.1:3000` |
| `SPOTIFY_REDIRECT_URI` | `http://127.0.0.1:3000/api/auth/spotify/callback` |
| `TRUST_PROXY` | `false` |
| `CLIENT_IP_SOURCE` | `express` (or unset) |

`127.0.0.1` is the canonical local origin: Spotify rejects `localhost`
redirect URIs, and CORS/origin checks compare origins exactly.

## 9. Browser security model

Session cookie `blendify_session` (and the 10-minute `oauth_state` cookie):
`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, **host-only** (no `Domain`),
so it is scoped to `api.blendify.camilasabino.dev`.

- `blendify.camilasabino.dev` and `api.blendify.camilasabino.dev` are the same
  site (`camilasabino.dev`), so `fetch(..., { credentials: 'include' })`
  sends a `Lax` cookie and third-party-cookie blocking does not apply.
- The OAuth callback is a top-level `GET` navigation, so `Lax` sends
  `oauth_state`.
- CORS allows exactly `FRONTEND_URL` with credentials; never `*`.
- `OriginCsrfGuard` rejects state-changing requests whose `Origin`/`Referer`
  is not exactly `FRONTEND_URL`. This matters because `SameSite=Lax` treats
  every `*.camilasabino.dev` subdomain as same-site.
- Swagger (`/api/docs`) is only mounted outside production.

## 10. Spotify Developer Dashboard

App settings:

| Field | Value |
|---|---|
| Website | `https://blendify.camilasabino.dev` |
| Redirect URIs | `https://api.blendify.camilasabino.dev/api/auth/spotify/callback` and, for local development, `http://127.0.0.1:3000/api/auth/spotify/callback` |
| Privacy policy URL (if the dashboard/quota form asks) | `https://blendify.camilasabino.dev/privacy` |
| APIs used | Web API |
| User Management | Add every Spotify account that will sign in (Development Mode allowlist) |

Redirect URIs must match exactly; `localhost` is not accepted. Guest Mode uses
Client Credentials and does not depend on the allowlist. The client secret
lives only in Railway.

## 11. Logging and privacy

Structured JSON logs go to Railway's log view. They must never contain Spotify
access/refresh tokens, session JWTs or cookies, transfer tokens, Soundiiz
share URLs, full tracklists, or secrets.

- Outbound Spotify accounts/profile calls (`/api/token`, `/me`) log method,
  URL, status and duration only (`logBodies: false`).
- The shared Spotify Web API client (catalog, search, playlist and playback
  calls) also runs with `logBodies: false` whenever `NODE_ENV=production`, so
  no catalog or search response body reaches the logs; method, sanitized URL,
  status and duration remain.
- Last.fm response bodies are not logged in production.
- Soundiiz calls log no bodies; `transfer.created`/`transfer.failed` log
  counts, categories and durations only.
- Query parameters named like tokens, secrets, `code`, or `api_key` are
  redacted.
- The limiter logs a 12-character SHA-256 hash of the caller identity, never
  raw IPs or user IDs.
- Known residual exposure: the edge HTTP logs of the hosting provider record
  request paths, including the one-time OAuth `code`/`state` on the callback.

## 12. Deploy procedure

1. Merge to `main` with green CI.
2. If `.railway/railway.ts` changed: `railway config plan`, review it
   against the known drift in section 4.3, then `railway config apply` only
   if nothing applied outside IaC would be removed.
3. Railway's GitHub trigger (section 4.9) waits for the GitHub check suites,
   then builds, runs the pre-deploy migration, and switches traffic after
   `/api/health` returns 200. A commit outside the API watch patterns is
   recorded as `SKIPPED`.
4. Deploy the SPA manually with Wrangler (section 3.1). Workers Builds is not
   connected, so a merge alone does not ship the frontend.
5. Run the smoke tests (section 13).

First deploy order: IaC apply (section 4.4) → secrets (dashboard), Redis
settings and PostgreSQL volume size (section 4.2) → first API deploy → API custom
domain → Worker deploy with `VITE_API_URL` → Spotify dashboard → smoke
tests → remove the generated Railway domain.

## 13. Post-deploy smoke tests

### Guest (signed out, fresh browser profile)

- [ ] `https://blendify.camilasabino.dev` loads; a hard reload on
      `/app/discover` and `/privacy` returns the page (SPA fallback, no 404).
- [ ] `/app/mix`: artist search shows results with a Spotify link per result;
      selected chips link to Spotify.
- [ ] `/app/discover`: artist and track seeds work; genre list loads.
- [ ] Generate a Mix and a Discover playlist: NDJSON progress reaches the
      result; tracks link to Spotify; cover artwork (when shown) links to
      Spotify.
- [ ] Transfer present: the Soundiiz card offers `Prepare transfer`; it calls
      `POST /api/transfers` and then shows an explicit `Continue on Soundiiz`
      link. Nothing redirects or opens a window on its own.
- [ ] `/app/library` redirects to Mix with the Spotify-required notice.
- [ ] Footer "Privacy" opens `/privacy`; the contact link is
      `mailto:contacto@camilasabino.dev`.

### Spotify Mode (allowlisted account)

- [ ] Connect Spotify → consent → callback lands on `/app/mix`.
- [ ] Publish a Mix and a Discover playlist with "Add a cover image" on; they
      appear in Spotify with the Blendify graphic cover (no Spotify artist or
      album artwork in it).
- [ ] Library and Stats load.
- [ ] Log out → Guest Mix works.

### Security and operations

- [ ] HTTPS on both hosts; `http://` redirects to `https://` (frontend
      redirect still pending, see section 3.3).
- [ ] Response headers on the web host match section 3
      (`curl -sI https://blendify.camilasabino.dev/app/mix`).
- [ ] DevTools → Application → Cookies (`api.blendify…`): `blendify_session`
      is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`,
      expires in 7 days.
- [ ] CORS rejects foreign origins:
      `curl -si -H 'Origin: https://evil.example' https://api.blendify.camilasabino.dev/api/health`
      returns `Access-Control-Allow-Origin: https://blendify.camilasabino.dev`
      (never the foreign origin or `*`), so the browser blocks the read; the
      preflight from the web host returns the same origin and
      `Access-Control-Allow-Credentials: true`.
- [ ] CSRF: `curl -si -X POST -H 'Content-Type: application/json' -d '{}' https://api.blendify.camilasabino.dev/api/generate/mix`
      → `403`; the same with `-H 'Origin: https://evil.example'` → `403`.
- [ ] `https://api.blendify.camilasabino.dev/api/docs` → `404`.
- [ ] `GET /api/health` → `200`, `database: up`.
- [ ] `npx prisma migrate status` against production → up to date.
- [ ] Redis over Railway SSH (section 6): 256 MiB `maxmemory`,
      `noeviction`, RDB/AOF disabled, 512 MiB container limit.
- [ ] Optional, in a quiet window: stop Redis → generation returns
      `503 SERVICE_UNAVAILABLE`, search keeps answering; start Redis → both
      recover without an API restart.

### Client IP identity (required — M10 is not complete without it)

Use a cached query so the test does not spend Spotify quota (run it once
first to warm the cache). `search` allows 60 requests per 60 s per identity.

```sh
API=https://api.blendify.camilasabino.dev
for i in $(seq 1 61); do
  curl -s -o /dev/null -w '%{http_code}\n' "$API/api/artists/search?q=daft%20punk"
done | sort | uniq -c              # expect 60 × 200 and 1 × 429

curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'X-Forwarded-For: 203.0.113.9' "$API/api/artists/search?q=daft%20punk"
                                    # expect 429: a spoofed header does not change identity
```

- [ ] Within the same minute, from a genuinely different network (for example
      a phone on mobile data), the same request returns `200`.
- [ ] The `request_limit.rejected` log line's identity hash equals the first
      12 hex characters of `sha256("ip:<your public IP>")`:
      `printf 'ip:%s' "$(curl -s https://api.ipify.org)" | shasum -a 256 | cut -c1-12`.

Run the loop with separate connections (one `curl` per request) and once
more reusing one connection; both must stop at 60.

If all anonymous callers share one identity, new connections get a fresh
bucket, or the spoofed header changes the identity, stop: correct
`CLIENT_IP_SOURCE` from the observed chain and repeat.

### 13.1 Production validation record (M10, Guest transfer still disabled)

Full run against the live production URLs, API revision `84654c2` (the deploy
built from that commit; `750ee9f` was correctly `SKIPPED` as a
docs/`.railway` change), frontend Worker version
`5ad815ca-43d1-49f5-93eb-683a74d55794` built from `750ee9f`.

| Area | Result |
|---|---|
| Frontend | `/`, `/app/mix`, `/app/discover`, `/privacy`, arbitrary routes all serve `index.html` with 200; security headers and immutable asset caching as in section 3; no horizontal overflow at 320, 390 or 1280 px; no console errors |
| Frontend bundle | Contains `https://api.blendify.camilasabino.dev`; no localhost API fallback |
| API | `/api/health` 200 with `database: up`; custom domain active |
| Guest catalog | Artist search, track search, genre list and genre search all answer with Spotify `externalUrl` per item |
| Guest generation | One Mix, two seeds × 3 tracks: NDJSON progress rendered to completion, 6 tracks, every track linked to Spotify, cover artwork linked to its own Spotify resource, recipe summary shown, `transfer: null`, no transfer CTA anywhere |
| Guest protected pages | `/app/library` and `/app/stats` redirect to Mix with the Connect Spotify notice |
| Spotify OAuth | Full flow through `https://api.blendify.camilasabino.dev/api/auth/spotify/callback`, landing authenticated on `/app/mix`; no redirect-URI, client or state error |
| Session cookie | `blendify_session` on `api.blendify.camilasabino.dev` (host-only, no `Domain`), `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 7-day expiry |
| Spotify Mode | One Mix (5 tracks) and one Discover (15 tracks) generated and published to Spotify; both reachable by their `open.spotify.com/playlist/...` links; no Guest transfer path in the authenticated UI |
| Library | Both new playlists listed with correct kind, track count and duration; the only artwork shown is each playlist's own Spotify playlist image (`ab67706c…` mosaic), no catalog artist or album artwork reused as a cover |
| Stats | Loads with coherent counters; `GET /api/stats` 200; no Spotify artist photos |
| Logout | Session cookie removed, Spotify-only navigation gone, Library and Stats back to Guest behavior, Guest Mix still usable |
| CORS | `Access-Control-Allow-Origin` is always exactly the production origin for a correct, foreign (`https://evil.example`) or sibling (`https://x.camilasabino.dev`) `Origin` and for no `Origin`; never `*`, never reflected; preflight identical |
| CSRF | State-changing requests: production `Origin` allowed, missing `Origin` 403, `https://evil.example` 403, `https://x.camilasabino.dev` 403 |
| Guest transfer gate | `POST /api/transfers` with the production `Origin` → `404`; with any other or no `Origin` → `403` from the CSRF guard before the gate |
| Client IP / rate limit | See section 5: one identity per client across new and reused connections, forged `X-Forwarded-For` and `X-Real-IP` ineffective, a single identity hash in every rejection log line |
| Logs | No `Authorization` headers, cookies, session or Spotify tokens, transfer URLs, or provider response bodies; only `{type, method, url, status, durationMs}` for outbound calls and hashed identities for limiter events; no Redis, database, `store_unavailable` or `invalid_client_ip` events |
| Railway | Deployment `SUCCESS`, one production GitHub trigger, PostgreSQL and Redis private, `GUEST_TRANSFER_ENABLED=false`, `CLIENT_IP_SOURCE=railway-x-forwarded-for`, cost controls unchanged, `railway config plan` showing only the two known drifts from section 4.3 |

Open item from this run: the HTTP → HTTPS Redirect Rule for the frontend
(section 3.3). Resolved since: `http://blendify.camilasabino.dev` answers
`301` to the HTTPS origin.

### 13.2 Guest transfer rollout record (2026-09-26)

Run against the live production URLs with `GUEST_TRANSFER_ENABLED=true`. API
deployment `8955e618` (a redeploy of the image built from `f9a884a`, so the new
variable reached the container; the web-only commits were correctly `SKIPPED`
by the watch patterns), frontend Worker version `6c6e5cfa` built from
`0dc53d3`.

| Area | Result |
|---|---|
| API | Deployment `SUCCESS`, `/api/health` 200 with `database: up`, `GUEST_TRANSFER_ENABLED=true`, `CLIENT_IP_SOURCE=railway-x-forwarded-for`, `CLIENT_IP_DIAGNOSTICS` not set, PostgreSQL and Redis private |
| Frontend | Worker rebuilt from `origin/main` with `VITE_API_URL=https://api.blendify.camilasabino.dev`; no localhost fallback in the bundle |
| Guest generation | Artist Mix, two seeds × 3 tracks: 201 in ≈ 8 s, 6 tracks, `transfer` non-null, one-hour expiry, HS256 with issuer `blendify` and audience `blendify:playlist-transfer`, no destination anywhere in the payload |
| Soundiiz payload | Only the playlist title, its description, and per track the title, the artists and the ISRC. No Spotify or session identifiers |
| `POST /api/transfers` | 201 in ≈ 0.7 s, `url` accepted by the strict validator, `trackCount` 6, 24-hour expiry, no `destination` field |
| Browser flow | `Prepare transfer` → `POST /api/transfers` 201 → explicit `Continue on Soundiiz` link (`target=_blank`, `rel="noopener noreferrer"`). No automatic redirect, no automatic window, no console errors |
| Soundiiz review | Correct title and description, source `Blendify`, 6 tracks with correct artists; 38 destinations offered with none preselected |
| Real transfer | Destination chosen on Soundiiz (Spotify): all 6 of 6 tracks transferred, expected title and description, no unmatched tracks. The destination playlist is created public by Soundiiz; Blendify sends no visibility |
| CSRF | `POST /api/transfers`: production `Origin` reaches the endpoint, missing `Origin` 403, `https://evil.example.com` 403, `https://x.camilasabino.dev` 403 |
| Token validation | Malformed token and tampered signature → `TRANSFER_TOKEN_INVALID`; unknown body → `VALIDATION_ERROR`. Expiry, issuer, audience, algorithm and payload shape covered by `playlist-transfer-tokens.service.spec.ts` and `guest-mode.http.spec.ts` |
| Rate limiting | The `transfer` bucket returns `429` with `Retry-After` once 10 requests in 600 s are used, without extra provider traffic |
| Returned-URL validation | `isSafeShareUrl` rejects foreign hosts, subdomains, ports, credentials, query strings and fragments; the adapter maps an unsafe response to `TRANSFER_PROVIDER_UNAVAILABLE` and never forwards it |
| Logs | Only `transfer.created` with `trackCount`, `acceptedTrackCount` and `durationMs`, plus `outbound_http` for the fixed `POST https://soundiiz.com/go/import-playlist`. No transfer token, share URL, request or response body, Spotify token, `Authorization` header, cookie or secret |
| Guest regression | Mix and Discover generate normally, artist/track/genre catalog answers, a generation that never uses transfer still works, `/api/playlists` and `/api/stats` 401 for guests |
| Spotify Mode regression | OAuth and session work, direct publication creates the Spotify playlist, Library persists it as `COMPLETED`, Stats updates its counters, the account menu still offers logout and account deletion, and no Guest transfer path appears in the authenticated UI |
| CORS | `Access-Control-Allow-Origin` is always exactly the production origin for correct, foreign, sibling and absent `Origin`, and on preflight; never `*`, never reflected |
| Railway drift | `railway config plan` shows only the two known drifts from section 4.3; `GUEST_TRANSFER_ENABLED` no longer appears |

## 14. Rate limits and capacity

Production starts with the M5 defaults and one API replica:

| Bucket | Default | Store unavailable |
|---|---|---|
| `search` | 60 / 60 s | fail-open |
| `similar` | 60 / 60 s | fail-open |
| `resolve` | 20 / 60 s | fail-closed |
| `generation` | 12 / 600 s | fail-closed |
| `transfer` | 10 / 600 s | fail-closed |
| Generation concurrency | 2 per client, 6 global | fail-closed |

Observe before changing anything (`RATE_LIMIT_OVERRIDES`,
`GENERATION_CONCURRENCY_*`):

- `request_limit.rejected` volume per bucket and reason;
- Spotify `429` / quota errors and cooldowns (Development Mode budget is the
  real ceiling);
- `CAPACITY_EXCEEDED` (global cap) versus `CONCURRENCY_LIMITED` (per client);
- generation duration versus the 30 s lease/10 s renewal
  (`request_limit.permit_lost`);
- Redis `used_memory` and `store_unavailable` warnings.

Deferred: IPv6 /64 grouping, contextual Guest market.

## 15. Rollback

| What | How |
|---|---|
| Frontend | Cloudflare → Workers → `blendify-web` → Deployments → roll back, or `npx wrangler@4 rollback --config apps/web/wrangler.jsonc`. `VITE_API_URL` is baked into each build. |
| API | Railway → API service → Deployments → redeploy/rollback the previous successful deployment. Migrations are not reverted. |
| Database | No down migrations. Keep migrations expand-only so the previous API version still works. Restore the pre-migration dump only for a destructive failure (section 7). |
| Feature gates / limits | Change `GUEST_TRANSFER_ENABLED` or `RATE_LIMIT_OVERRIDES` in Railway; a variable change redeploys. Emergency brake for external transfer: `GUEST_TRANSFER_ENABLED=false`. Emergency brake for generation: `RATE_LIMIT_OVERRIDES=generation=1/3600`. |

## 16. Guest transfer gate

`GUEST_TRANSFER_ENABLED=true` is the production value. Guest results carry a
signed, short-lived `transfer` token and `POST /api/transfers` is reachable.

The variable remains the kill switch for the external integration:

| Value | Effect |
|---|---|
| `true` | Guest results carry a `transfer` token; `POST /api/transfers` creates a Soundiiz import link |
| `false` | Guest results carry `transfer: null`, the Soundiiz card disappears and `POST /api/transfers` returns `404`. Guest generation, catalog, search, Mix, Discover and all of Spotify Mode keep working |

Set it to `false` in Railway to switch the Soundiiz path off without taking
Guest playlist generation down. A variable change redeploys the API.

Operational notes:

- Soundiiz is an external dependency. Its public playlist-import endpoint is
  called once per transfer, with a 10 s timeout and no retries; failures map to
  `TRANSFER_PROVIDER_UNAVAILABLE` or `TRANSFER_PLAYLIST_REJECTED`.
- Blendify sends only the playlist title, its description when present, and per
  track the title, the artists and the ISRC when known. It sends no destination:
  the destination service is chosen by the user on Soundiiz.
- Transfer tokens, Soundiiz request and response bodies and the temporary share
  URL must never be logged (section 11). If any of them appears in the logs,
  set `GUEST_TRANSFER_ENABLED=false` until it is fixed.

## 17. Spotify attribution

Guest and search surfaces that show Spotify metadata or artwork link back to
the Spotify object that the data came from, using URLs returned by Spotify
(`external_urls.spotify`); the web app never builds Spotify URLs from IDs and
only renders `https://open.spotify.com/…` links:

- artist search results, selected artist chips, the Discover seed artist;
- track search results, the Discover seed track, and every Guest track;
- the Guest cover: shown only when the artwork carries its own Spotify link
  (the artist for artist images, the track for album art); otherwise the
  Blendify fallback tile is shown.
- Library covers show only the image Spotify reports for the playlist itself;
  seed artwork is never used as a playlist cover.
- Custom playlist covers are Blendify-owned graphics (title, palette, mark);
  they are never composed from Spotify artist or album artwork.
- Stats lists top artists without their Spotify photos (no link source is
  stored for them).

Brand assets are the unmodified official files from Spotify's Design &
Branding Guidelines, kept in `apps/web/src/assets/spotify/` (see its
`SOURCE.md`) and served as separate files (never inlined or re-encoded).
On Blendify's charcoal surfaces only the **white monochrome** variants are
used:

| Place | Asset | Size |
|---|---|---|
| Guest attribution line ("Track details from" + logo) | Full logo, white | 72 px wide (minimum 70 px) |
| Connect Spotify buttons, account menu | Icon, white (brand context already clear from the label/account) | 21 px, 11 px gap (half icon height) |
| Per-artist / per-track links (search results, chips, seeds, Guest tracks) | Icon, white | 21 px inside a 43 px target (11 px exclusion zone) |

Search-result links sit next to (not inside) the `role="option"` element, are
reachable with Tab while the list is open, and activating them never selects
the option.

<a id="18-data-deletion-requests"></a>

## 18. Account deletion

Deletion is self-service. A user signed in with Spotify opens the account menu,
chooses **Delete account**, confirms the destructive dialog, and the API
handles the rest:

`DELETE /api/account` (authenticated, Origin-checked) deletes the `users` row
for the session owner in a single statement. The foreign-key cascades remove
playlists, seed usage and usage stats in the same transaction, the
`blendify_session` cookie is cleared, and the browser returns to Guest mode. No
developer action is required, and the published contact address is only for
privacy questions, not for routine deletions.

Operational notes:

- The API logs `{"event":"account.deleted"}` and nothing else about the
  account; there is no identifier to correlate afterwards, by design.
- Deletion is irreversible and there is no soft delete. A user who signs in
  again gets a new, empty account.
- Deleted data still exists in any earlier manual `pg_dump` (section 7). Delete
  or rotate dumps that contain the account.
- Restoring a backup during incident recovery resurrects accounts deleted after
  the dump was taken. After such a restore, re-check any deletion the user
  reported between the dump and the incident.

Account model (`apps/api/prisma/schema.prisma`):

| Table | Identifies / holds | Relation to `users` |
|---|---|---|
| `users` | The account: `id` (internal), `spotifyId` (unique), `displayName`, `email`, `imageUrl`, Spotify `accessToken` / `refreshToken` / `tokenExpiresAt` | — |
| `playlists` | Library playlists: name, description, Spotify ID/URL, seeds, tracks, recipe, image | `userId` → `users.id`, `ON DELETE CASCADE` |
| `seed_usages` | Stats: artist/genre seeds used, counts, image | `userId` → `users.id`, `ON DELETE CASCADE` |
| `user_usage_stats` | Stats counters | `userId` → `users.id`, `ON DELETE CASCADE` |

Guest usage stores nothing in PostgreSQL. Redis holds only catalog cache and
short-lived rate-limit/concurrency keys (at most about 10 minutes); logs hold
only hashed identities.

### Manual fallback (exceptional support only)

Use the SQL procedure below only when the self-service flow cannot be used —
for example the user has lost access to their Spotify account, or the frontend
is down during an incident. It is not the normal workflow.

1. **Verify the requester.** The request must come from the email address
   stored on the account (`users.email`, the Spotify account email). If there
   is no match, reply asking them to write from that address or to include
   their Spotify display name for manual confirmation; do not delete on an
   unverified request.
2. **Find the account** through the CLI tunnel
   (`railway connect postgres --tunnel-only`, then `psql` against the tunnel):

   ```sql
   SELECT id, "spotifyId", "displayName", "createdAt"
   FROM users
   WHERE lower(email) = lower('<requester email>');
   ```

3. **Delete in one transaction** (cascades remove playlists, seed usage and
   stats):

   ```sql
   BEGIN;
   DELETE FROM users WHERE id = '<user id from step 2>';
   COMMIT;
   ```

4. **Verify** (all counts must be 0):

   ```sql
   SELECT
     (SELECT count(*) FROM users            WHERE id = '<user id>') AS users,
     (SELECT count(*) FROM playlists        WHERE "userId" = '<user id>') AS playlists,
     (SELECT count(*) FROM seed_usages      WHERE "userId" = '<user id>') AS seed_usages,
     (SELECT count(*) FROM user_usage_stats WHERE "userId" = '<user id>') AS usage_stats;
   ```

5. **Sessions:** an existing `blendify_session` JWT for the deleted user stays
   signature-valid for up to 7 days, but every authenticated request resolves
   the user from PostgreSQL, so it authorizes nothing and the browser is
   treated as Guest. Signing in again creates a new, empty account.
6. **Spotify authorization** is revoked separately by the user at
   `https://www.spotify.com/account/apps/` (Blendify's stored tokens are
   already deleted in step 3). Playlists Blendify published remain in the
   user's Spotify account; the user deletes them in Spotify if wanted.
7. **Backups:** deleted data remains in any earlier manual `pg_dump`
   (section 7); delete or rotate dumps that contain the account.
8. **Reply** to the requester confirming the deletion and mentioning steps 6
   and 7.

Never paste connection strings, tokens or real user identifiers into issues,
commits or chat logs.

