# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Blendify is a full-stack Spotify playlist builder (npm workspaces monorepo plus a Python AI service). It combines the Spotify Web API with Last.fm discovery data and offers three ways to start: Mix (Artist Mix, Genre Mix), Discover (Discover Artist, Discover Track), and Create with AI (a natural-language request interpreted by the private AI service; the model never receives provider data or chooses tracks). Every generation has a typed, versioned "recipe" (seeds, popularity preference, ordering mode, track budget) that can be published to Spotify (Spotify Mode) or transferred through Soundiiz (Guest Mode) and later reviewed.

```
Blendify/
├── apps/
│   ├── api/    # NestJS 11 API (@blendify/api)
│   │   ├── prisma/     # schema, migrations, demo seed
│   │   └── src/
│   │       ├── domain/         # entities, rules, value objects, ports
│   │       ├── application/    # use cases and application services
│   │       ├── infrastructure/ # Spotify/Last.fm clients, cache, persistence, auth
│   │       ├── modules/        # feature composition (NestJS modules)
│   │       └── presentation/   # controllers, pipes, guards, filters
│   ├── web/    # React 19 + Vite SPA (@blendify/web)
│   └── ai/     # internal FastAPI AI service (Python, uv; not an npm workspace)
├── packages/
│   └── contracts/  # shared Zod schemas and inferred types (@blendify/contracts)
├── docs/           # brand and product media
└── scripts/        # local lifecycle helpers (start/stop/restart/reset)
```

## Commands

```bash
npm run dev:api          # Nest watch mode (apps/api, port 3000)
npm run dev:web           # Vite dev server (apps/web, port 5173)
npm run build              # build every workspace
npm run test                # run contract, API, and web tests
npm run test:e2e          # Playwright browser suite (mocked API)
npm run lint                 # ESLint (api) + oxlint (web) across workspaces
npm run format:check    # verify API formatting (Prettier)

npm run db:generate      # generate Prisma Client
npm run db:migrate        # create/apply a local Prisma migration

npm run ai:sync / dev:ai / test:ai / lint:ai   # AI service (uv; port 8000)
ALLOW_PAID_AI_EVALS=true npm run eval:ai -- --confirm   # paid real-model intent eval (manual only, never in CI)

npm run docker:up          # start PostgreSQL + Redis
npm run start                 # start infra + both apps (logs in .blendify/logs/)
npm run stop / stop:all / restart
```

Per-workspace test commands:

```bash
npm run test:api                              # apps/api (Jest)
npm run test:web                              # apps/web (Vitest)
npm test -w @blendify/contracts        # packages/contracts (Vitest)

# single test file / pattern
npm test -w @blendify/api -- path/to/file.spec.ts
npm test -w @blendify/api -- -t "test name"
npm test -w @blendify/web -- path/to/file.test.ts
```

Requires Node.js 22+ (CI and production pin 22 via `.nvmrc`), npm 10+, and Docker (PostgreSQL 16 + Redis 7) or compatible local services. See README.md for full environment setup (`.env` files, Spotify OAuth redirect URI, Last.fm key; the scopes are in `apps/api/.env.example`) and each workspace's README for app-level details.

Git hooks (Husky + commitlint) enforce Conventional Commits and run lint on pre-commit/pre-push. Commit subjects must follow `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Architecture

**Ports-and-adapters (hexagonal) on the API.** `apps/api/src/domain` holds entities, value objects, domain services (`strategies/` for allocation and track ordering, `specifications/` for duplicate/alternate-version rules), and repository *ports* (interfaces) — no framework or I/O dependencies. `apps/api/src/application` holds use cases that orchestrate domain logic via those ports. `apps/api/src/infrastructure` provides the concrete adapters: Spotify clients (catalog, playlist, playback, auth, quota/rate-limit handling) behind a user-bound `spotify-music.provider`, Last.fm client, Redis-backed cache (falls back to in-memory if Redis is down), and Prisma-backed persistence. `apps/api/src/modules` wires everything together per feature (auth, account, catalog, generation, playlists, playback, stats, transfers, ai, health), and `apps/api/src/presentation` is the HTTP boundary (controllers, pipes, guards, exception filter) — one normalized error envelope for all responses.

**Shared contracts are the source of truth.** `packages/contracts` defines Zod schemas for HTTP requests/responses, errors, playlist recipes, and statistics; both `apps/api` and `apps/web` depend on `@blendify/contracts` and infer TypeScript types from the same schemas rather than duplicating shape definitions.

**Web app** (`apps/web/src`) is a Vite SPA: `pages/` for route-level screens (landing, privacy, mix, discover, ai, library, stats), `stores/` for Zustand state (e.g. `auth-store.ts`), `lib/` for API client, error mapping, generation streaming, and other framework-agnostic helpers, `hooks/` and `components/` for UI, `i18n/` for English/Spanish/Brazilian Portuguese translations.

**AI service** (`apps/ai`): internal FastAPI service reached only by the API through the `INTENT_INTERPRETER` port (`infrastructure/ai`), authenticated with a shared bearer token. It interprets user-authored text into typed intent; it never receives Spotify/Last.fm/Soundiiz data, IDs, URLs, or user data, and never calls those providers. It runs as a private Railway service with no public domain; the browser never calls it. Its wire contract is owned by `@blendify/contracts/ai-service` (Zod); Python mirrors it and both sides are checked against `packages/contracts/ai-service/` (normalized contract + shared fixtures). Changing the contract: edit the Zod schema, run `npm test -w @blendify/contracts -- -u`, update the Pydantic models until `npm run test:ai` passes. The API and Mix/Discover must keep working when the AI service is absent.

**Auth**: Spotify OAuth with server-side token storage in PostgreSQL and an HTTP-only `blendify_session` cookie (no tokens in the browser). Session cookies are always `Secure` and host-only; the canonical local origin is `http://127.0.0.1:5173` (Spotify rejects `localhost` redirect URIs). Production deployment is documented in `docs/deployment.md`.

**External API pressure**: Spotify Development Mode has a strict rolling request budget. The API mitigates this with Redis-backed search/catalog caches, sequential resolution, lazy suggestions, and typed quota errors surfaced through `spotify-quota-guard`/`spotify-quota.service`. Generation limits: 12 artists per Artist Mix, 5 genres per Genre Mix, 50 tracks per playlist, `floor(50 / seedCount)` tracks per seed.

**Logging**: outbound Spotify/Last.fm/token-refresh calls use structured JSON logging with secrets and sensitive query params redacted.

## Paid AI provider calls

Never execute paid/external AI-provider calls or real-model evals without explicit user approval for that specific run, even if credentials are already configured. This covers OpenAI and any future model provider, real-model evals, paid API smoke tests, manual provider experiments, and submitting prompts to `/app/ai` while `apps/ai/.env` enables a real provider. A configured `AI_PROVIDER_API_KEY` is not authorization. Mocked/deterministic tests are unaffected.

No normal command (dev, start, test, lint, format, build, git/install hooks, CI) may trigger a real model call. `eval:ai` stays manual-only: it refuses to run unless `AI_PROVIDER` names a real (non-`disabled`) provider, `AI_MODEL`, the provider's own requirements (for example `AI_PROVIDER_API_KEY`), a command-line `ALLOW_PAID_AI_EVALS=true` (never persisted in an env file), and `--confirm` are all present.

## Functional fixes are local-first

Reproduce, debug and validate functional changes and bug fixes locally (deterministic tests, local services, mocks, local E2E) before any commit or deploy. Never use production to discover, reproduce, debug or iteratively validate a functional bug, and never deploy just to prove a fix that can be validated representatively in local development. Post-deploy production checks stay minimal and non-destructive: deployment/infrastructure/configuration health and integration properties that cannot be represented locally (real hosting/networking, production OAuth callback configuration, an explicitly authorized provider smoke). Production smokes never substitute for missing local regression coverage, and the paid-provider approval rule above still applies. Full rule: `docs/engineering/code-conventions.md` → Testing.

## Quality analysis

The `sonar` workflow (`.github/workflows/sonar.yml`) sends coverage/analysis for API, web, and contracts to SonarCloud (`sonar-project.properties`). The `sonar` GitHub check is required for pull requests, but the scan step runs with `continue-on-error: true`, so the SonarCloud Quality Gate is currently non-blocking. SonarCloud Automatic Analysis must stay disabled for the CI-based scan to run.

## Engineering conventions

Full detail: `docs/engineering/code-conventions.md` (read it for architecture, refactoring, or code-review work). The highest-signal rules for every session:

- Preserve the hexagonal boundaries and the monorepo boundaries (`apps/api` ↔ `apps/web` ↔ `packages/contracts`) — no cross-app imports, no framework/Prisma/Axios/HTTP objects in `domain/`.
- Prefer feature/domain-first organization over generic buckets; don't add to `lib/utils.ts` or similar dumping grounds — put feature logic next to the feature.
- No comments or JSDoc by default. Add one only for a genuinely non-obvious, critical constraint (security invariant, provider/protocol quirk, documented workaround) — never to restate what the code already says.
- Watch for oversized, multi-responsibility files/functions (rough signals: file >400–500 LOC, function >40–60 LOC, component >150–200 LOC) — but size alone isn't a violation; check for mixed responsibilities before splitting.
- `@blendify/contracts` stays the source of truth for shared request/response/error contracts — infer types from its Zod schemas rather than hand-duplicating shapes.
- Avoid premature abstractions; prefer a little clear duplication over an incorrect generalization.
- Tests protect behavior/contracts, not private implementation details.
- No parent-relative imports (`../`) across directories — use the `@/*` alias in `apps/api`/`apps/web`; same-directory (`./x`) relative imports are fine.
- Braces are mandatory for every `if`/`else`/`for`/`while`/`do…while` body, even single-statement ones — no inline `if (x) return`/`throw`/`break`/`continue`.
- Separate logical blocks (setup, validation, side effects, result) with a blank line; don't pad trivial single-line guards.
- Extract magic numbers/strings that represent provider limits, thresholds, or business rules into a named constant, at the narrowest correct ownership level (function-local → module → feature/domain constants file → provider constants → `@blendify/contracts` only for genuine shared wire contracts).
- Share a constant across files only when both usages are the same semantic invariant — matching literal values alone is not a reason to share one. Never add a generic `constants.ts` dumping ground.
