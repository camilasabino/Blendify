# Blendify API

NestJS 11 backend for Blendify and the only public backend in the system. It
serves the web app, owns authentication and sessions, talks to Spotify,
Last.fm, and Soundiiz, and is the sole caller of the private AI service.

Product overview and setup: [root README](../../README.md). Production
operations: [`docs/deployment.md`](../../docs/deployment.md).

## Responsibilities

- Spotify OAuth and session management for Spotify Mode; Client Credentials
  access to the catalog for Guest Mode.
- Playlist generation for Mix and Discover (streamed as NDJSON progress),
  publishing to Spotify, Library, Stats, and playback control.
- Create with AI sessions: interpretation, clarification, generation,
  refinement, publishing, and transfer (`/api/ai/sessions`).
- Guest playlist transfer through Soundiiz.
- Rate limits, generation concurrency, and the provider-content firewall
  toward the AI service.

## Architecture

Ports-and-adapters under `src/`:

| Layer | Contents |
|---|---|
| `domain/` | Entities, value objects, rules, strategies (allocation, ordering), specifications, AI intent rules, repository ports. No framework or I/O. |
| `application/` | Use cases and services that orchestrate the domain through ports. |
| `infrastructure/` | Adapters: Spotify (catalog, playlist, playback, auth, quota), Last.fm, Soundiiz, AI service, Redis cache and request-limit stores, Prisma repositories, auth. |
| `modules/` | NestJS wiring per feature (auth, catalog, generation, playlists, playback, stats, transfers, account, ai, health). |
| `presentation/` | Controllers, guards, pipes, and the exception filter (one normalized error envelope). |

Conventions and boundaries are in
[`docs/engineering/code-conventions.md`](../../docs/engineering/code-conventions.md).
Imports across directories use the `@/*` alias.

## Boundaries

| Dependency | Role |
|---|---|
| Spotify Web API | Catalog search and metadata, playlist publishing, playback. Guest calls use an app token; Spotify Mode calls use the signed-in user's token. |
| Last.fm API | Similar artists and tag-based discovery. |
| Soundiiz | Guest transfer. Only the title, description, and per-track title, artists, and ISRC are sent. |
| AI service | Reached through the `INTENT_INTERPRETER` port (`infrastructure/ai`) over the private network with a bearer token. Requests carry only user-authored text and AI-safe intent state. Optional: unset `AI_SERVICE_URL` and AI features report unavailable while everything else keeps working. |
| PostgreSQL (Prisma) | Users and their Spotify tokens, Library playlists and recipes, seed usage, and usage stats. Guests store nothing. |
| Redis | Search and catalog cache, rate-limit and concurrency counters, and Create with AI sessions (30-minute TTL). Falls back to process memory for the cache when unreachable; some limits fail closed (see the runbook). |

## Authentication

Spotify OAuth authorization-code flow. Spotify tokens are stored server-side
in PostgreSQL. The browser only holds the `blendify_session` cookie:
`HttpOnly`, `Secure`, `SameSite=Lax`, host-only, a 7-day signed JWT. Requests
that change state are checked by `OriginCsrfGuard` against `FRONTEND_URL`.

Create with AI sessions use a separate ownership credential for Guests: a
random access key sent in the `X-Ai-Session-Key` header, from which the public
session id in the URL is derived one way. See
[`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).

## Shared contracts

Request, response, and error shapes come from
[`@blendify/contracts`](../../packages/contracts/README.md); the API infers
types from the same Zod schemas as the web app. Domain entities may
intentionally differ from wire DTOs.

## Local setup

Requirements: Node 22+, Docker for PostgreSQL 16 and Redis 7, a Spotify
Developer app, and a Last.fm API key (see the root README for the redirect URI
and scopes).

```bash
npm install                                  # from the repository root
cp apps/api/.env.example apps/api/.env
docker compose up -d
npm run db:generate && npm run db:migrate
npm run dev:api                              # http://127.0.0.1:3000
```

`apps/api/.env.example` is the source for variable names and local values. The
API loads `apps/api/.env` first and falls back to a root `.env` (the root
`.env.example` mirrors it). The groups are: application (`PORT`, `FRONTEND_URL`), data stores (`DATABASE_URL`,
`REDIS_URL`), request protection (`TRUST_PROXY`, `CLIENT_IP_SOURCE`, rate-limit
and concurrency settings), the Guest transfer gate, the optional AI service
(`AI_SERVICE_URL`, `AI_SERVICE_TOKEN`), `JWT_SECRET`, Spotify OAuth, and
`LASTFM_API_KEY`. Production requirements are enforced at startup by
`src/config/production-environment.ts`.

Swagger is served at `/api/docs` outside production only.

## Migrations

```bash
npm run db:migrate                   # prisma migrate dev (local only)
npm run prisma:deploy -w @blendify/api   # prisma migrate deploy (what production runs)
```

Never run `migrate dev`, `db push`, or `migrate reset` against production.
Migrations must be expand-only; see the runbook.

## Commands

```bash
npm run dev:api                            # watch mode (from the root)
npm run test:api                           # Jest
npm test -w @blendify/api -- path/to/file.spec.ts
npm run lint -w @blendify/api              # ESLint
npm run format:check -w @blendify/api      # Prettier
npm run build:api                          # contracts, Prisma client, Nest build
```

Tests use fakes and mocks for Spotify, Last.fm, Soundiiz, and the AI service.
Redis integration specs run only when `REDIS_TEST_URL` is set and are skipped
otherwise. No command here calls a real provider or model, and none should:
paid AI calls need explicit approval per run.
