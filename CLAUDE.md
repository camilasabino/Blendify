# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Blendify is a full-stack Spotify playlist builder (npm workspaces monorepo). It combines the Spotify Web API with Last.fm discovery data to build four playlist types: Artist Mix, Genre Mix, Discover Artist, Discover Track. Every generation has a typed, versioned "recipe" (seeds, popularity preference, ordering mode, track budget) that can be published to Spotify and later reviewed.

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
│   └── web/    # React 19 + Vite SPA (@blendify/web)
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
npm run lint                 # ESLint (api) + oxlint (web) across workspaces
npm run format:check    # verify API formatting (Prettier)

npm run db:generate      # generate Prisma Client
npm run db:migrate        # create/apply a local Prisma migration

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

Requires Node.js 22+ (CI and production pin 22 via `.nvmrc`), npm 10+, and Docker (PostgreSQL 16 + Redis 7) or compatible local services. See README.md for full environment setup (`.env` files, Spotify OAuth scopes/redirect URI, Last.fm key).

Git hooks (Husky + commitlint) enforce Conventional Commits and run lint on pre-commit/pre-push. Commit subjects must follow `feat:`, `fix:`, `docs:`, `chore:`, etc.

## Architecture

**Ports-and-adapters (hexagonal) on the API.** `apps/api/src/domain` holds entities, value objects, domain services (`strategies/` for allocation and track ordering, `specifications/` for duplicate/alternate-version rules), and repository *ports* (interfaces) — no framework or I/O dependencies. `apps/api/src/application` holds use cases that orchestrate domain logic via those ports. `apps/api/src/infrastructure` provides the concrete adapters: Spotify clients (catalog, playlist, playback, auth, quota/rate-limit handling) behind a user-bound `spotify-music.provider`, Last.fm client, Redis-backed cache (falls back to in-memory if Redis is down), and Prisma-backed persistence. `apps/api/src/modules` wires everything together per feature (auth, catalog, playlists, playback, stats, health), and `apps/api/src/presentation` is the HTTP boundary (controllers, pipes, guards, exception filter) — one normalized error envelope for all responses.

**Shared contracts are the source of truth.** `packages/contracts` defines Zod schemas for HTTP requests/responses, errors, playlist recipes, and statistics; both `apps/api` and `apps/web` depend on `@blendify/contracts` and infer TypeScript types from the same schemas rather than duplicating shape definitions.

**Web app** (`apps/web/src`) is a Vite SPA: `pages/` for route-level screens (mix, discover, library, stats, landing), `stores/` for Zustand state (e.g. `auth-store.ts`), `lib/` for API client, error mapping, generation streaming, and other framework-agnostic helpers, `hooks/` and `components/` for UI, `i18n/` for English/Spanish/Brazilian Portuguese translations.

**Auth**: Spotify OAuth with server-side token storage in PostgreSQL and an HTTP-only `blendify_session` cookie (no tokens in the browser). Session cookies are always `Secure` and host-only; the canonical local origin is `http://127.0.0.1:5173` (Spotify rejects `localhost` redirect URIs). Production deployment is documented in `docs/deployment.md`.

**External API pressure**: Spotify Development Mode has a strict rolling request budget. The API mitigates this with Redis-backed search/catalog caches, sequential resolution, lazy suggestions, and typed quota errors surfaced through `spotify-quota-guard`/`spotify-quota.service`. Generation limits: 12 artists per Artist Mix, 5 genres per Genre Mix, 50 tracks per playlist, `floor(50 / seedCount)` tracks per seed.

**Logging**: outbound Spotify/Last.fm/token-refresh calls use structured JSON logging with secrets and sensitive query params redacted.

## Quality analysis

CI sends coverage/analysis for API, web, and contracts to SonarCloud (`sonar-project.properties`). SonarCloud Automatic Analysis must stay disabled for the CI-based scan to run.
