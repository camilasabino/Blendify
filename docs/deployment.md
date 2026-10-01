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
                                                                            └─► ai (FastAPI) ─► OpenAI
```

| Piece | Where | Notes |
|---|---|---|
| Web SPA | Cloudflare Workers static assets (`apps/web/wrangler.jsonc`) | Custom domain `blendify.camilasabino.dev`, SPA fallback |
| API | Railway service `api` (Infrastructure as Code: `.railway/railway.ts`), Hobby plan, 1 replica | Custom domain `api.blendify.camilasabino.dev`, **DNS-only** |
| PostgreSQL | Railway `postgres` database (`.railway/railway.ts`) | Private network only; backups by manual `pg_dump` (section 7) |
| Redis | Railway `redis` database (`.railway/railway.ts`) | Private network only, `noeviction`, no persistence |
| AI service | Railway service `ai` (`.railway/railway.ts`), 1 replica | Private network only (`ai.railway.internal:8000`), no public domain; reached only by `api` (section 19) |

Decisions:

- The API is **not** proxied through Cloudflare. Cloudflare Universal SSL covers
  one subdomain level only (`*.camilasabino.dev`), so it cannot terminate
  `api.blendify.camilasabino.dev` without Advanced Certificate Manager, and a
  second proxy would change the client-IP chain (see [client IP](#5-client-ip-client_ip_source-and-trust_proxy)).
- The browser calls the API origin directly with `credentials: 'include'`.
- The AI service joins the same Railway project and is reached by `api` over
  `ai.railway.internal`; the browser never calls it (section 19).

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

### 3.1 How the live frontend is deployed (GitHub Actions + Wrangler CLI)

Workers Builds is **not** connected for `blendify-web`. The production Worker
is uploaded by CI:

- `.github/workflows/ci.yml` ("CI") runs on every pull request and on every
  push to `main`: formatting, lint, unit/integration tests (contracts, API,
  web, each on its own runner to avoid CPU contention between suites), the
  full build, and the deterministic Playwright suite. It never deploys.
- `.github/workflows/deploy-web.yml` ("Deploy Web") triggers via
  `workflow_run` once "CI" finishes on `main`, and only runs its `deploy` job
  when that CI run's conclusion is `success`. It checks out the exact commit
  CI tested (`workflow_run.head_sha`), runs `npm run build:web` with
  `VITE_API_URL=https://api.blendify.camilasabino.dev` and
  `VITE_AI_CREATION_ENABLED=true`, then
  `npx wrangler@4 deploy --config apps/web/wrangler.jsonc` using the
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repository secrets
  (section 8.1), followed by a non-destructive HTTP smoke check against
  `https://blendify.camilasabino.dev`. A `deploy-frontend-production`
  concurrency group (not cancel-in-progress) keeps at most one deploy
  in-flight and prevents an older commit from deploying after a newer one.
  Both workflows pin official Actions to their current stable major
  (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`
  as of September 2026) rather than staying on the majors an earlier draft of
  this pipeline used.

**Unverified interaction with Railway's "Wait for CI" — check on first
rollout.** Railway's Wait for CI (section 4.9) waits for every GitHub Actions
check suite reported against a commit SHA, ignoring only checks from other
GitHub Apps. `deploy-web.yml` is triggered by `workflow_run` against the same
`main` commit CI just tested, and GitHub Actions runs triggered this way are
their own check suite on that commit. Cloudflare's and Railway's own docs do
not state whether Railway's Wait for CI also waits on a `workflow_run`
-triggered workflow that only appears after the triggering one completes, so
this cannot be confirmed statically. The plausible failure mode: if
`deploy-web.yml`'s `deploy` job actually runs (CI succeeded) and then fails
(for example, `wrangler deploy` errors), Railway's own docs say "a workflow
that fails skips the deployment immediately" — which, if Railway is indeed
tracking this second check suite, would also skip the Railway API deploy for
that commit even though the API itself was fine. A skipped `deploy` job (CI
failed, so `deploy-web.yml`'s job condition is false) is safe either way,
since Railway's docs say a skipped/neutral workflow never blocks. **Action
item for the first real push to `main` after this pipeline ships:** watch
whether Railway's deployment clears as soon as "CI" succeeds, or additionally
waits on "Deploy Web". Do not change Wait for CI or move the Railway trigger
into GitHub Actions to preempt this — confirm the actual behavior first.

**"CI" concurrency on `main` is per-commit, not shared.** PR runs use
`group: ci-CI-<PR number>` with `cancel-in-progress: true` (a new push to the
same PR cancels its own superseded run). Pushes to `main` use
`group: ci-CI-main-<commit sha>` with `cancel-in-progress: false` — every
commit on `main` gets its own group, so pushing a second commit never cancels
the first commit's still-running "CI". Railway's own docs warn that a
mandatory check workflow sitting in a concurrency group that cancels queued
runs can get cancelled and (if another workflow on that same commit still
succeeded) let a deployment through without it; keeping each `main` commit in
its own group removes that risk entirely for "CI" and, by extension, for
"Deploy Web".

**Branch protection.** `main` is covered by a repository ruleset ("main
required checks") requiring `quality`, `test-contracts`, `test-api`,
`test-web`, `e2e`, and `sonar` to pass before a pull request can merge. The
`sonar` check comes from `.github/workflows/sonar.yml`, whose SonarCloud scan
step runs with `continue-on-error: true`: the check is required, but the scan
result and the SonarCloud Quality Gate are currently non-blocking, so the gate
can be `ERROR` while the check passes.
`commitlint` (PR-only) and `Deploy Web` (downstream of CI) are intentionally
not required checks, and Railway's own deploy is not a GitHub merge check.
Direct pushes to `main` remain allowed; no PR-review count is required.

Manual deploy from a local clean checkout is still available as a fallback:

```sh
nvm use                      # Node 22 from .nvmrc
npm ci
VITE_API_URL=https://api.blendify.camilasabino.dev VITE_AI_CREATION_ENABLED=true npm run build:web
npx wrangler@4 deploy --config apps/web/wrangler.jsonc
```

The uploaded version records `source: wrangler` and
`workers/triggered_by: upload` in its Cloudflare metadata, with the commit
short SHA as the deploy message.

### 3.2 Workers Builds (not active; reference for a future switch)

| Setting | Value |
|---|---|
| Repository / branch | `camilasabino/blendify` / `main` |
| Root directory | `/` (repository root, needed for npm workspaces) |
| Build command | `npm ci && npm run build:web` |
| Deploy command | `npx wrangler@4 deploy --config apps/web/wrangler.jsonc` |
| Build watch paths | `apps/web/**`, `packages/contracts/**`, `package.json`, `package-lock.json`, `.nvmrc` |
| Build variable | `VITE_API_URL=https://api.blendify.camilasabino.dev` |
| Node version | from `.nvmrc` (22) |

### 3.3 HTTP → HTTPS

`http://blendify.camilasabino.dev/` redirects to `https://` with a `301`
via a **scoped** Cloudflare Redirect Rule on the zone:

| Field | Value |
|---|---|
| When incoming requests match | `(http.host eq "blendify.camilasabino.dev" and not ssl)` |
| Target URL (dynamic) | `concat("https://blendify.camilasabino.dev", http.request.uri)` |
| Status | `301` |
| Preserve query string | enabled |

Zone-wide "Always Use HTTPS" must stay **off**: it would change unrelated
`camilasabino.dev` traffic. The Wrangler OAuth credentials only hold
`zone:read`, so Redirect Rules cannot be created from the CLI; this rule is a
dashboard action and does not survive `wrangler` deploys touching DNS/zone
settings.

`VITE_API_URL` is a **build** variable, not a runtime variable: Vite compiles
it into the bundle. A production build fails when it is missing, not an
absolute origin (no path, query or trailing slash), or not `https` (plain
`http` is accepted only for `127.0.0.1` / `[::1]` local builds)
(`apps/web/config/api-url.ts`). The only other `VITE_*` variable is the optional
`VITE_AI_CREATION_ENABLED` (see [AI service](#19-ai-service)); never
put a secret in a `VITE_*` variable.

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
| `api` | Source `github("camilasabino/blendify", { branch: "main" })`, repository root as build context; builder `RAILPACK`; build `npm run build:api`; watch patterns `apps/api/**`, `packages/contracts/**`, `package.json`, `package-lock.json`, `.nvmrc`; pre-deploy `npm run prisma:deploy -w @blendify/api`; start `npm run start:prod -w @blendify/api`; health check `/api/health`, timeout 120 s; 1 replica; restart `ON_FAILURE` (5 retries); `RAILPACK_NODE_NPM_INSTALL=npm ci`; `PORT=8080`; non-secret variables; `DATABASE_URL`/`REDIS_URL` as typed references to the databases; secrets as `preserve()`; AI integration: `AI_SERVICE_URL=http://ai.railway.internal:8000`, `AI_SERVICE_TOKEN` as `preserve()` |
| `ai` | Source `github("camilasabino/blendify", { branch: "main", rootDirectory: "apps/ai" })`; builder `RAILPACK`; watch pattern `apps/ai/**`; start `python -m app.server`; health check `/health`; region `sfo` with 1 replica; draining 30 s; non-secret variables `AI_SERVICE_ENV`, `PORT`, `AI_PROVIDER`, `AI_MODEL`; `OPENAI_API_KEY` and `AI_SERVICE_TOKEN` as `preserve()` (section 19) |

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
  `LASTFM_API_KEY` and `AI_SERVICE_TOKEN` on `api`; `OPENAI_API_KEY` and
  `AI_SERVICE_TOKEN` on `ai`): declared with `preserve()`, so IaC never writes
  or prints them; set them once in the dashboard (sealed).
- The absence of a public domain and TCP proxy on `ai`. Undeclared
  networking is left unmanaged by `plan`/`apply`, and empty
  `serviceDomains`/`customDomains` maps do not enforce anything either (a
  read-only plan with `customDomains: {}` on `api` does not propose removing
  its custom domain). Verify it in the dashboard or in
  `railway environment config --json` (the `ai` entry has no `networking`
  key).
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
places. `railway config plan` currently reports exactly these two lines and
nothing for `ai`:

| Plan line | Why | Action |
|---|---|---|
| `redis deploy.limitOverride.containers.memoryBytes (536870912 → null)` | The Redis 512 MiB memory cap was applied outside IaC; the `redis()` helper cannot represent it. | **Accepted external/manual configuration boundary.** Applying this plan would remove the cap. |
| `api deploy.restartPolicyType (null → "ON_FAILURE")` | Railway stores the default policy as `null` (retries stay at 5); it reappears after every apply. | Known and harmless; review it in every plan. |

**Operational rule:** never run `railway config apply` without reviewing the
plan. If the plan proposes removing the Redis 512 MiB limit (or any other
setting listed in section 4.2), do not apply it. The live Redis memory cap
must stay 512 MiB unless it is changed intentionally. A plan that proposes
deleting the `ai` service or the `api` variables `AI_SERVICE_URL` /
`AI_SERVICE_TOKEN` means the authoring file is out of date; never apply it.

### 4.4 First-time setup

1. Create an empty Railway project and link the repository:
   `railway init --name Blendify --workspace "<workspace>"` (creates the
   project and links the current directory to its `production` environment).
   Make sure the Railway GitHub app can access `camilasabino/blendify`, and
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
| `api` | Railpack with `npm ci`, Node 22, 1 replica, `PORT=8080`, private connections to PostgreSQL and Redis, custom domain `api.blendify.camilasabino.dev` **ACTIVE** on port 8080 (the generated Railway domain was removed), `/api/health` 200, `AI_SERVICE_URL=http://ai.railway.internal:8000`, `AI_SERVICE_TOKEN` sealed, `CLIENT_IP_SOURCE=railway-x-forwarded-for`, `GUEST_TRANSFER_ENABLED=true`, `CLIENT_IP_DIAGNOSTICS` not set |
| `postgres` | PostgreSQL 18.6, 5 GB volume, private networking only (no public domain, no public TCP proxy), no Railway backups or PITR on Hobby; backups by manual `pg_dump` (section 7) |
| `ai` | Railpack (Python 3.13, `uv`), root `apps/ai`, 1 replica in `sfo`, draining 30 s, `python -m app.server` on `PORT=8000`, `/health` 200, `AI_SERVICE_ENV=production`, `AI_PROVIDER=openai`, `AI_MODEL=gpt-5.6-luna`, `OPENAI_API_KEY` and `AI_SERVICE_TOKEN` sealed, private networking only (no public domain, no TCP proxy) |
| `redis` | 512 MiB container memory limit, `maxmemory` 256 MiB, `noeviction`, RDB and AOF disabled, authenticated, private networking only (no public domain, no public TCP proxy) |

### 4.9 Automatic deploys (GitHub trigger)

There is exactly **one** deployment trigger per Railway service, and it is the
only supported way that service reaches production:

| Field | `api` | `ai` |
|---|---|---|
| Provider | `github` | `github` |
| Repository | `camilasabino/blendify` | `camilasabino/blendify` |
| Branch | `main` | `main` |
| Environment | `production` | `production` |
| Wait for CI (`checkSuites`) | `true` | `true` |
| Watch patterns | `apps/api/**`, `packages/contracts/**`, `package.json`, `package-lock.json`, `.nvmrc` | `apps/ai/**` |

A push to `main` therefore waits for the GitHub check suites and deploys a
service only when they pass. A commit that touches nothing under a service's
watch patterns is recorded as `SKIPPED` with `"No changes to watched files"`
for that service — that is correct behavior for docs-only or `.railway/`-only
commits, not a broken trigger. Do not create a second
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

### 8.1 Frontend (build variables)

Both are Vite build variables compiled into the bundle. The live frontend is
built by `.github/workflows/deploy-web.yml` (section 3.1), so their production
values are the `env` of its `npm run build:web` step, not Cloudflare
dashboard variables.

| Variable | Required | Secret | Value |
|---|---|---|---|
| `VITE_API_URL` | Yes (build fails otherwise) | No, public | `https://api.blendify.camilasabino.dev` |
| `VITE_AI_CREATION_ENABLED` | No (production builds hide `/app/ai` unless it is `true`) | No, public | `true` |

### 8.1.1 GitHub Actions secrets and variables (repository level)

| Name | Kind | Required for | Notes |
|---|---|---|---|
| `SONAR_TOKEN` | Secret | `sonar.yml` sonar job | Already configured |
| `CLOUDFLARE_API_TOKEN` | Secret | `deploy-web.yml` | Scoped token, **not** account-wide (see below) |
| `CLOUDFLARE_ACCOUNT_ID` | Repository **variable** (`vars`, not `secrets`) | `deploy-web.yml` | Not a credential — it grants no access by itself, it just tells Wrangler which account to target. Kept out of `wrangler.jsonc` only so the workflow stays copy-pasteable |

Creating `CLOUDFLARE_API_TOKEN` (Cloudflare dashboard → **Manage Account** →
**Account API Tokens** → **Create Token** → custom token):

- Scope: **Specified Workers** → select `blendify-web` only (Cloudflare's
  granular Workers authorization, GA September 2026 — not the older
  account-wide "Workers Scripts" permission group).
- Role: **Editor** — allows reading, updating, deploying and renaming an
  existing Worker (script content, settings, versions, deployments); cannot
  create or delete Workers, cannot touch other Workers on the account.
- No Zone / `Workers Routes` permission is needed: the custom domain
  (`blendify.camilasabino.dev`) is already configured in the Cloudflare
  dashboard, and per Cloudflare's docs, "after a Route or Custom Domain is
  configured, you can deploy new Worker versions with only `Editor` access,
  as long as the deployment does not add, update, or remove that connection."
  `deploy-web.yml` only runs `wrangler deploy` with the existing
  `wrangler.jsonc`; it never changes routes or the custom domain, so `Editor`
  scoped to this one Worker is the complete minimum.
- This intentionally supersedes the account-wide `Workers Scripts: Edit` +
  zone `Workers Routes: Edit` token described in an earlier draft of this
  document — that was the pre-granular-authorization model and grants far
  more than this pipeline needs.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are only referenced by the
`deploy` job in `deploy-web.yml`, which never runs for `pull_request` events —
PR runs only exercise `ci.yml`, which has no access to either.

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
| `AI_REFINEMENTS_PER_SESSION` | No | Unset (default 10 refinement interpretations per Create with AI session) |

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
- a removed variable is still set: `JWT_EXPIRES_IN`, `COOKIE_SECRET`, `API_URL`;
- `AI_SERVICE_URL` is set but is not an `http(s)` URL without credentials, or
  `AI_SERVICE_TOKEN` is shorter than 32 characters (both are optional; see
  [AI service](#19-ai-service)).

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

- Outbound Spotify accounts/profile calls (`/api/token`, `/me`), the AI
  service and Soundiiz always run with `logContent: false`: method,
  content-free URL, status and duration only.
- The shared Spotify Web API client and the Last.fm client run with
  `logContent: false` whenever `NODE_ENV=production`. No request or response
  body is logged, and the URL is content-free: ID-like path segments become
  `:id`, and every query value except operational keys (`method`, `type`,
  `limit`, `offset`, `market`, `format`, `autocorrect`, `fields`,
  `additional_types`, `include_groups`, `page`) becomes `***`, so search
  terms and artist/track/genre names are not logged. Outside production the
  full sanitized URL and redacted bodies are logged for debugging.
- Soundiiz calls log no bodies; `transfer.created`/`transfer.failed` log
  counts, categories and durations only.
- Generation diagnostics (Spotify catalog, Last.fm, genre and Discover
  fallbacks) log counts and error messages, never the artist, track or tag
  names involved.
- Query parameters named like tokens, secrets, `code`, or `api_key` are
  redacted.
- The limiter logs a 12-character HMAC-SHA-256 of the caller identity keyed
  with a random per-process key (an unkeyed hash of an IPv4 address could be
  reversed), never raw IPs or user IDs. The key rotates on every restart, so
  the hash correlates events within one process only.
- Every API request gets an opaque `X-Request-Id` (random UUID, response
  header). Create with AI events carry it as `requestId`, and the API forwards
  it to the AI service, which logs it on its model-call events. It is not an
  auth credential and contains no user data.
- Unhandled errors log the error class name, `requestId` and stack frames, not
  the error message (messages can embed request or ORM content).
- Create with AI logs metadata only (`ai.operation`, `ai.diagnostic`,
  `ai.service_call` in the API; `ai.model_request`, `ai.model_call` in the AI
  service). See `docs/engineering/ai-data-handling.md` for the allowlist.
- Log retention is configured in Railway and Cloudflare, outside this
  repository; the application does not set or enforce a retention period.
- The Create with AI ownership credential never appears in a URL. The
  `/api/ai/sessions/:sessionId` path carries a public identifier derived
  one-way from that credential; the credential itself travels in the
  `X-Ai-Session-Key` request header. Edge access logs record request paths and
  not request headers by default, so do not enable request-header capture (for
  example Cloudflare Logpush request-header fields) for that header.
- The rate-limit `identityHash` in `request_limit.rejected` is a log label only:
  an HMAC keyed with a random per-process secret, so it changes on restart and
  differs between replicas. Limits are enforced on the stable identity key
  (`u:<userId>` or `ip:<address>`) in the shared store, never on that hash.
- Known residual exposure: the edge HTTP logs of the hosting provider record
  request paths, including the one-time OAuth `code`/`state` on the callback.

## 12. Deploy procedure

1. Merge to `main` with green CI.
2. If `.railway/railway.ts` changed: `railway config plan`, review it
   against the known drift in section 4.3, then `railway config apply` only
   if nothing applied outside IaC would be removed.
3. Two things happen off the same "CI" check suites, independently and in no
   required order relative to each other:
   - Railway's GitHub trigger (section 4.9) waits for the GitHub check
     suites, then builds, runs the pre-deploy migration, and switches traffic
     after `/api/health` returns 200. A commit outside the API watch patterns
     is recorded as `SKIPPED`.
   - GitHub Actions' `deploy-web.yml` (section 3.1) waits for the "CI"
     workflow run on `main` to conclude, and deploys the SPA with Wrangler
     only if it succeeded.
   Neither waits on the other: the frontend and the API are independent
   deployables, and GitHub Actions never waits on a Railway deployment
   (Railway's own status is not surfaced as a GitHub check, so doing so would
   risk an ordering cycle).
4. Run the smoke tests (section 13).

First deploy order: IaC apply (section 4.4) → secrets (dashboard), Redis
settings and PostgreSQL volume size (section 4.2) → first API deploy → API custom
domain → Worker deploy with `VITE_API_URL` → Spotify dashboard → smoke
tests → remove the generated Railway domain.

## 13. Post-deploy smoke tests

These checks verify the deployment and environment-specific integration
(hosting, networking, OAuth callback, production configuration). They are not
a substitute for local functional validation: functional fixes are reproduced
and validated locally first (see `docs/engineering/code-conventions.md` →
Testing).

### Guest (signed out, fresh browser profile)

- [ ] `https://blendify.camilasabino.dev` loads; a hard reload on `/app`,
      `/app/discover` and `/privacy` returns the page (SPA fallback, no 404).
- [ ] `/app`: the App Home offers Mix, Discover and Create with AI, and does
      not redirect to Mix.
- [ ] `/app/mix`: artist search shows results with a Spotify link per result;
      selected chips link to Spotify.
- [ ] `/app/discover`: artist and track seeds work; genre list loads.
- [ ] Generate a Mix and a Discover playlist: NDJSON progress reaches the
      result; tracks link to Spotify; cover artwork (when shown) links to
      Spotify.
- [ ] Transfer present: the Soundiiz card offers `Prepare transfer`; it calls
      `POST /api/transfers` and then shows an explicit `Continue on Soundiiz`
      link. Nothing redirects or opens a window on its own.
- [ ] `/app/library` redirects to `/app` with the Spotify-required notice.
- [ ] Footer "Privacy" opens `/privacy`; the contact link is
      `mailto:contacto@camilasabino.dev`.

### Spotify Mode (allowlisted account)

- [ ] Connect Spotify from the landing page → consent → callback lands on
      `/app`; started from `/app/mix` it comes back to `/app/mix`.
- [ ] Publish a Mix and a Discover playlist with "Add a cover image" on; they
      appear in Spotify with the Blendify graphic cover (no Spotify artist or
      album artwork in it).
- [ ] Library and Stats load.
- [ ] Log out → the Guest App Home at `/app` works.

### Security and operations

- [ ] HTTPS on both hosts; `http://blendify.camilasabino.dev` redirects to
      `https://` with a `301` through the scoped Redirect Rule of section 3.3.
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
- [ ] The `request_limit.rejected` log lines of one run of the loop carry the
      same `identityHash`. The hash is an HMAC keyed with a random
      per-process secret (section 11), so it cannot be recomputed from your
      IP address and changes after every restart; the identity itself is
      proven by the 429 behavior above.

Run the loop with separate connections (one `curl` per request) and once
more reusing one connection; both must stop at 60.

If all anonymous callers share one identity, new connections get a fresh
bucket, or the spoofed header changes the identity, stop: correct
`CLIENT_IP_SOURCE` from the observed chain and repeat.

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
| AI service | Railway → `ai` → Deployments → redeploy/rollback the previous successful deployment. Stateless; nothing to migrate. |
| Database | No down migrations. Keep migrations expand-only so the previous API version still works. Restore the pre-migration dump only for a destructive failure (section 7). |
| Feature gates / limits | Change `GUEST_TRANSFER_ENABLED` or `RATE_LIMIT_OVERRIDES` in Railway; a variable change redeploys. Emergency brake for external transfer: `GUEST_TRANSFER_ENABLED=false`. Emergency brake for generation: `RATE_LIMIT_OVERRIDES=generation=1/3600`. |
| Create with AI | See [section 19.6](#196-feature-gate-and-kill-switches). Config-only; no database rollback. |

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
- Transfer tokens are HS256-signed JWTs with issuer `blendify` and audience
  `blendify:playlist-transfer`, carrying only the playlist/track data above (no
  user, session, or Spotify identifier), reusable until they expire.
- The Soundiiz import URL returned to the client is validated (`isSafeShareUrl`)
  before it is shown: foreign hosts, subdomains, ports, credentials, query
  strings and fragments are all rejected. An unsafe response is mapped to
  `503 TRANSFER_PROVIDER_UNAVAILABLE` and never forwarded to the browser.
- Blendify does not send or control the destination playlist's visibility. In
  the validated Spotify-destination transfer, the playlist Soundiiz created
  was public; Blendify cannot currently override that.
- The `OriginCsrfGuard` runs before the feature gate: a request from the
  production `Origin` when the gate is off still resolves to a clean `404`,
  but a missing or foreign `Origin` is rejected with `403` regardless of the
  gate's state.
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

## 19. AI service

`apps/ai` (FastAPI, Python managed by `uv`) interprets user-authored requests
for Create with AI. It runs in production as the private Railway service `ai`,
declared in `.railway/railway.ts` (section 4.1). The web entry point is gated
by a build-time flag (section 19.6).

### 19.1 Topology

```
browser ──► Cloudflare (SPA) ── no AI URL, no AI credential
browser ──► api (NestJS, public) ──► ai (FastAPI, private) ──► OpenAI
                  └──► PostgreSQL, Redis, Spotify, Last.fm, Soundiiz
```

- The browser never calls `ai`; `ai` has no public domain, no TCP proxy and
  no CORS policy. `api` reaches it at `http://ai.railway.internal:8000`.
- `api` stays the only public backend. It owns sessions, rate limits,
  ownership checks and the provider-content firewall; AI sessions live in
  Redis (30-minute TTL, no PostgreSQL history). `ai` is stateless: restarts
  or replacement lose nothing but the requests in flight.
- `OPENAI_API_KEY` exists only on `ai`. `AI_SERVICE_TOKEN` exists only on
  `api` and `ai`.
- Mix, Discover, Library, publishing and transfer never call `ai`.

### 19.2 Service shape (Railpack)

| Setting | Value |
|---|---|
| Service | `ai`, same Railway project and environment, **no public domain**, no TCP proxy |
| Source | `github("camilasabino/blendify", { branch: "main", checkSuites: true })`, root directory `apps/ai` (the runtime needs nothing outside it) |
| Builder | `RAILPACK`: detects `pyproject.toml` + `uv.lock`, Python from `apps/ai/.python-version` (3.13), installs with `uv sync --locked --no-dev` into `/app/.venv` (on `PATH`) |
| Watch patterns | `apps/ai/**` |
| Start | `python -m app.server`: reads `PORT`, binds one socket on `::` with `IPV6_V6ONLY=0` and runs uvicorn with the `app.main:create_app` factory on it. The dual-stack socket is intentional: Railway deployment health checks arrive over IPv4, while the private network may use IPv6. Do not replace it with `uvicorn --host ::`, which asyncio leaves IPv6-only (health checks fail with `service unavailable`), nor with `--host 0.0.0.0`, which drops IPv6. uvicorn handles `SIGTERM` gracefully. No `main.py` exists, so Railpack cannot infer a start command |
| `PORT` | `8000`, set explicitly so `AI_SERVICE_URL` and the health check use the same port |
| Health check | `/health`, no auth, no model call |
| Replicas | 1; one uvicorn worker (enough for current traffic; the process is stateless, so adding replicas later needs no code change) |
| Restart | Railway default (`ON_FAILURE`); not declared in IaC, so the plan does not carry a second `null → "ON_FAILURE"` line like `api` |
| Draining | `drainingSeconds: 30` (Railway defaults to 0 s, which cuts a model call in flight on every redeploy; a call takes at most two 12 s model requests) |

Startup fails closed with `AI_SERVICE_ENV=production`: the process exits when
`AI_SERVICE_TOKEN` is shorter than 32 characters, `AI_PROVIDER` is not
`openai` or `disabled`, or `AI_PROVIDER=openai` lacks `AI_MODEL` or
`OPENAI_API_KEY`. Production also hides `/docs` and `/openapi.json`.

### 19.3 Variables

| Service | Variable | Secret | Value |
|---|---|---|---|
| `ai` | `AI_SERVICE_ENV` | No | `production` |
| `ai` | `PORT` | No | `8000` |
| `ai` | `AI_PROVIDER` | No | `openai` (`disabled` keeps the service up with interpretation unavailable) |
| `ai` | `AI_MODEL` | No | `gpt-5.6-luna` |
| `ai` | `OPENAI_API_KEY` | Yes, `preserve()`, sealed | Production key, never copied from a local `.env` |
| `ai` | `AI_SERVICE_TOKEN` | Yes, `preserve()`, sealed | ≥ 32 random characters, for example `openssl rand -base64 48` |
| `api` | `AI_SERVICE_URL` | No | `http://ai.railway.internal:8000` (`http`: the private network is already encrypted) |
| `api` | `AI_SERVICE_TOKEN` | Yes, `preserve()`, sealed | Same value as on `ai` |
| `api` | `AI_REFINEMENTS_PER_SESSION` | No | Unset (default 10) |

Every route except `/health` requires `Authorization: Bearer <AI_SERVICE_TOKEN>`
(constant-time comparison; with no token configured those routes reject every
request). The token is never logged and is not an OpenAI credential. Rotating
it needs both services updated: set the new value on `ai` and `api`, then
redeploy both; requests between the two deploys fail as AI unavailable (Mix
and Discover are unaffected).

The service sends OpenAI the versioned system prompt and the user's request
text only (`store=false`, SDK retries off, 12 s per model request, at most two
requests when the first output is invalid); it never logs prompts or model
output. `api` waits up to 30 s for `ai`.

Known benign log line: the OpenAI SDK's HTTP client logs one INFO line per
model request, for example
`INFO:httpx2:HTTP Request: POST https://api.openai.com/v1/responses "HTTP/1.1 200 OK"`.
It contains the method, URL and status only (no prompt, output, headers or
credentials) and is left as is.

### 19.4 Health

`GET /health` returns `200 {"status":"ok","intentInterpretation":"available"}`
(`"unavailable"` with `AI_PROVIDER=disabled`). It proves the process is up and
the configuration was accepted at startup; it never calls OpenAI, so it says
nothing about the key, billing or model access. Railway runs it only during a
deploy. `GET /api/health` on `api` does not check `ai`, so an `ai` outage never
blocks an `api` deploy.

### 19.5 Limits

The public endpoints that call the AI service, `POST /api/ai/sessions` and
`POST /api/ai/sessions/:id/refinements`, share the rate-limit bucket `interpret`
(default 30 per 10 minutes per client, fail-closed). Refinements are also capped
per session by `AI_REFINEMENTS_PER_SESSION` (default 10). A refinement sends the
AI service only the session's AI-safe intent, the positions or user-authored
artist names to keep, and the user's refinement text; never tracks, provider IDs
or destination state. There is no global cap across clients, so the OpenAI
project budget is the spending backstop and a **prerequisite** for keeping
`AI_PROVIDER=openai` in production: the production OpenAI project has an
enforced monthly hard limit of USD 5 (requests fail once it is reached; not
alert-only) with notifications at 50 %, 80 % and 100 %. When the limit is hit,
`ai` reports the provider as unavailable and `api` answers `AI_UNAVAILABLE`;
Mix and Discover are unaffected. Raise it deliberately, never to unblock an
unexplained spike.

Other Create with AI endpoints on `api` (none of them call the AI service):
clarification answers (`POST /api/ai/sessions/:id/clarification`) use the
existing `resolve` bucket; `Create playlist` (`POST /api/ai/sessions/:id/generate`)
uses the existing `generation` bucket and generation concurrency limits, like
Mix and Discover; `GET /api/ai/sessions/:id` is a Redis-only read without a
bucket.

### 19.6 Feature gate and kill switches

Web entry point: `/app/ai` and its navigation item are compiled into
production builds only when `VITE_AI_CREATION_ENABLED=true` is in the
`build:web` step of `deploy-web.yml` (development builds show it by default).
Without it, a direct visit to `/app/ai` redirects to `/` and the SPA sends no
`/api/ai/*` request. The flag is a build-time value: changing it needs a new
web build and deploy, and it is not a runtime kill switch. Production builds
set it to `true`; it was enabled only after the provider-backed production
smoke (Guest and Spotify Mode) and the VoiceOver check had passed.

| Problem | Action | Effect |
|---|---|---|
| Hide the feature fast | Cloudflare → `blendify-web` → Deployments → roll back to the last version built without the flag, or `npx wrangler@4 rollback --config apps/web/wrangler.jsonc` | No rebuild; then remove the flag from `deploy-web.yml` so the next deploy keeps it hidden |
| Hide the feature durably | Remove `VITE_AI_CREATION_ENABLED` from `deploy-web.yml` and push | Next web deploy has no `/app/ai` |
| Too much AI traffic | `RATE_LIMIT_OVERRIDES=interpret=1/3600` on `api` | `api` redeploys; interpretations nearly stop |
| `api` ↔ `ai` integration | Unset `AI_SERVICE_URL` on `api` | `api` redeploys and reports AI unavailable without any network call |
| `ai` or OpenAI problem | `AI_PROVIDER=disabled` on `ai`, or stop the `ai` deployment | Interpretation unavailable; `api` answers `AI_UNAVAILABLE`, Mix/Discover unaffected |
| Bad `ai` release | Railway → `ai` → Deployments → roll back to the previous successful deployment | Previous image serves again; nothing to migrate |
| Leaked or suspect OpenAI key | Revoke the key in the OpenAI dashboard, then set a new sealed `OPENAI_API_KEY` on `ai` | Calls fail as unavailable until `ai` redeploys with the new key |

None of these touches PostgreSQL; AI sessions in Redis expire on their own
within 30 minutes. Removing the `ai` service is never required for a rollback.

### 19.7 Rollout order

Deployment order (dependencies first; each step is its own reviewed change):

1. OpenAI project budget with an enforced monthly hard limit and
   notifications (section 19.5). Done before any production model call.
2. Service `ai` from `camilasabino/blendify` (`main`, Wait for CI on) with the
   settings of section 19.2, variables of section 19.3 (secrets sealed,
   entered from stdin or the dashboard, never on a command line) as one staged
   change, and no domain. Confirm the deploy health check passed and that `ai`
   has no public domain or TCP proxy.
3. `AI_SERVICE_TOKEN` (sealed, same value) and `AI_SERVICE_URL` on `api` as one
   staged change; `api` redeploys. Run the Mix/Discover smoke tests
   (section 13).
4. `.railway/railway.ts` declares `ai` and the `api` AI variables (secrets as
   `preserve()`); `npm run check:railway` passes and `railway config plan`
   shows only the known drift of section 4.3.
5. With the web flag still off, an authorized real-model smoke through the
   API, then an authorized provider-backed smoke (Guest and Spotify Mode,
   including refinement and an explicit publish), then the VoiceOver check.
6. Add `VITE_AI_CREATION_ENABLED=true` to the `build:web` step of
   `deploy-web.yml` and push.
7. Through the public `/app/ai` UI, a Guest smoke and a Spotify
   reauthorization smoke (revoked access, `Save to Spotify`, `Connect
   Spotify`, return to the restored session without an automatic publish).

Steps 1–6 are complete in production; the web build sets
`VITE_AI_CREATION_ENABLED=true`.

`railway config apply` is not used for this service: its plan always contains
the Redis memory-cap removal of section 4.3. Change `ai` explicitly (dashboard
or CLI), review each change, and keep `.railway/railway.ts` in sync so the
plan stays at the known drift.

### Real-model evals (manual, paid)

Real-model evals are never part of CI. The `test-ai` job uses fakes only and
needs no `OPENAI_API_KEY`. Locally, the eval runs only as
`ALLOW_PAID_AI_EVALS=true npm run eval:ai -- --confirm` with `AI_PROVIDER=openai`,
`AI_MODEL` and `OPENAI_API_KEY` configured; the runner refuses before any request
if any of them is missing, or if `ALLOW_PAID_AI_EVALS` is persisted in `apps/ai/.env`
(flags are never abbreviated: `--confirm` must be written in full). `--suite intent` (default) or
`--suite refinement` selects the dataset. A run uses the production prompt, output schema,
validation and attempt bound, is capped at `cases × 2` model requests and 4,000 output tokens per
request, and stops on the first rate-limit or unavailable-provider error.

Each run writes one JSON report to `apps/ai/evals/results/` (gitignored, local only): suite,
configured and returned model, prompt and dataset versions with their SHA-256, model settings,
pass/fail per case, failed and errored case ids, model requests (every request, including invalid
outputs and retries), retries, input/output/total tokens as reported by the provider and whether
usage was complete (never estimated). It never contains secrets or raw provider responses; the
normalized structured output is kept only for cases that failed an expectation.

No GitHub eval workflow exists yet. If one is added, it must be a separate
`.github/workflows/ai-eval.yml` whose only trigger is `workflow_dispatch` (no
`push`, `pull_request`, `schedule` or `workflow_call`), and whose job declares
`environment: ai-evals`. Manual setup before that workflow exists:

1. Repository → Settings → Environments → New environment `ai-evals`.
2. Enable **Required reviewers** and add yourself. The repository is public, so
   required reviewers are available on every GitHub plan. Leave **Prevent
   self-review** off while you are the only reviewer, or the run cannot be
   approved.
3. **Deployment branches and tags** → Selected branches → `main` only.
4. Add `OPENAI_API_KEY` as an **environment secret** of `ai-evals`, never as a
   repository secret, so only approved jobs in that environment can read it.
5. Optionally set a spending limit for the project in the OpenAI dashboard.
