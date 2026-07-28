<p align="center">
  <img src="docs/brand/blendify-mark.svg" alt="Blendify" width="96" height="96" />
</p>

<h1 align="center">Blendify</h1>

<p align="center">
  Build Spotify playlists from <strong>artists</strong> or <strong>curated genres</strong> —
  pick seeds, tune the mix style, and Blendify writes a fresh playlist to your Spotify account.
</p>

```
React (Vite)  ──REST + cookies──▶  NestJS API  ──▶  Spotify Web API
                                      │
                                      └── PostgreSQL (users + playlist history)
```

## Features

- Spotify OAuth (tokens stay on the server; SPA uses an HTTP-only session cookie)
- Artist search, paste-to-resolve, and on-demand similar artists
- Curated genre catalog with explore suggestions
- Mix modes: popular, balanced, rarities, mood (energetic / chill / melancholic)
- Optional Blendify-generated cover art
- In-app preview + play on a Spotify device
- History: rename, purge from Spotify, bulk actions, regenerate
- Stats from your Blendify history
- EN / ES / PT (BR) UI

## Stack

| Layer | Tech |
| --- | --- |
| Web | React 19, TypeScript, Vite, React Router, TanStack Query, Zustand, Tailwind CSS 4, React Hook Form, Zod, oxlint |
| API | NestJS, hexagonal / DDD-ish layers, Prisma, PostgreSQL, Spotify OAuth 2.0, ESLint + Prettier |
| Infra | Docker Compose (Postgres + Redis), npm workspaces |
| Tests | Jest (API domain), Vitest (web) |

> Redis is started for local infra readiness; the current code path does not require it at runtime.

## Architecture (API)

```
apps/api/src/
├── domain/           # entities, rules, ports, generation strategies
├── application/      # use cases + DTOs
├── infrastructure/   # Spotify, Prisma, auth
└── presentation/     # controllers, guards, filters
```

Ports (`MusicProviderPort`, repositories) keep Spotify and Prisma behind adapters. Playlist assembly uses allocation / ordering strategies and dedup specs in `domain/services/`.

## Limits

| Rule | Value |
| --- | --- |
| Max artists | 25 |
| Max genres | 15 |
| Max tracks per playlist | 200 |
| Max songs per artist | 25 (also capped by `200 / artistCount`) |

Spotify **Development Mode** has a strict quota. Blendify budgets API calls (search cache, sequential generate, lazy similar artists, history sync opt-in). Prefer not to spam History **Refresh** / **Purge** while quota is exhausted.

## Getting started

### Prerequisites

- Node.js **20+**
- Docker Desktop
- A [Spotify Developer](https://developer.spotify.com/dashboard) app

### Spotify app

Redirect URI (must be `127.0.0.1`, not `localhost`):

```text
http://127.0.0.1:3000/api/auth/spotify/callback
```

Scopes:

```text
user-read-email user-read-private
playlist-modify-public playlist-modify-private
ugc-image-upload
user-read-playback-state user-modify-playback-state
```

### Environment

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `apps/api/.env`.  
Rotate `JWT_SECRET` and `COOKIE_SECRET` before any shared / production use.

### Install & DB

```bash
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
```

### Run

```bash
# terminal 1 — API  http://127.0.0.1:3000
npm run dev:api

# terminal 2 — Web  http://127.0.0.1:5173
npm run dev:web
```

Open **http://127.0.0.1:5173** (not `localhost`) so the session cookie matches OAuth.

- Swagger: http://127.0.0.1:3000/api/docs  
- Health: http://127.0.0.1:3000/api/health  

Or one-shot: `npm run start` (Docker + migrate + API + Web in background). Logs: `.blendify/logs/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start` / `stop` / `restart` / `reset` | Lifecycle helpers (`scripts/*.sh`) |
| `npm run stop:all` | Stop apps + Docker infra |
| `npm run dev:api` / `dev:web` | Watch / Vite (foreground) |
| `npm run build` | Build workspaces |
| `npm run test` / `test:api` / `test:web` | Tests |
| `npm run lint` / `lint:fix` | ESLint (API) + oxlint (web) |
| `npm run format` | Prettier (API) |
| `npm run docker:up` / `docker:down` | Postgres + Redis |
| `npm run db:generate` / `db:migrate` | Prisma |

## Project map

```text
Blendify/
├── apps/
│   ├── api/                 # NestJS
│   │   ├── prisma/          # schema + migrations
│   │   └── src/             # domain → application → infra → presentation
│   └── web/                 # React SPA
│       └── src/
│           ├── pages/       # routes
│           ├── components/  # ui/, artists/, genres/, playlist/, layout/
│           ├── hooks/ lib/ i18n/ stores/
│           │              └── i18n/locales/   # en.ts · es.ts · pt.ts
├── docs/brand/              # logo / mark assets
├── scripts/                 # start / stop / reset
├── docker-compose.yml
├── .env.example
└── package.json             # workspaces root
```

## Security

- Spotify access / refresh tokens live in Postgres and are **never** sent to the browser.
- The SPA authenticates via HTTP-only cookie `blendify_session` (JWT).
- Keep secrets out of git; use `.env` files from the examples.

## License

Private / unlicensed unless you add one.
