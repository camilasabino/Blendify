# Blendify Web

React 19 single-page app for Blendify, built with Vite. It renders the
product (Mix, Discover, Create with AI, Library, Stats) and talks only to the
Blendify API.

Product overview and setup: [root README](../../README.md). Deployment:
[`docs/deployment.md`](../../docs/deployment.md).

## Routes

`/` is the public landing (how to get in) and `/app` is the application home
(what to do). They are different responsibilities: the landing is the
acquisition surface, `/app` is the product home and works in both Guest and
Spotify Mode.

| Route | Screen | Availability |
|---|---|---|
| `/` | Landing | Everyone; a valid Spotify session is sent to `/app` |
| `/privacy` | Privacy policy | Everyone |
| `/spotify-access` | Why a Spotify account cannot connect | Everyone; opening it does not start Spotify login |
| `/app` | App Home (Mix, Discover, Create with AI) | Guest and Spotify |
| `/app/mix`, `/app/discover` | Mix and Discover | Guest and Spotify |
| `/app/ai` | Create with AI | Guest and Spotify, behind the feature flag below |
| `/app/library`, `/app/stats` | Library and Stats | Spotify only; Guests are redirected to `/app` with a notice |

Routes live in `src/App.tsx` and are lazy-loaded. Access is derived from the
current session in `src/lib/capabilities.ts` (`guest` or `spotify` mode).

`/app` is also where the app converges: the App Shell logo links to it, a
successful Spotify callback lands there by default, and logout and account
deletion both end there in Guest Mode.

## Entering and leaving Spotify Mode

A login started from the landing page ends on `/app`. A connection or
reconnection started from a Guest-capable route inside the app comes back to
that route: `src/lib/app-return-target.ts` remembers it in `sessionStorage`
and `src/components/layout/app-shell.tsx` consumes it when the callback lands
on `/app`. The target is one-shot, expires after 15 minutes, and is only ever
one of `/app/mix`, `/app/discover` or `/app/ai` (the last one only while the
Create with AI flag is on) — absolute URLs, `//host`, query strings, fragments
and Spotify-only routes are refused, and a failed attempt drops any pending
target so it cannot redirect a later login. Create with AI uses the same
mechanism: its session stays in `sessionStorage`, nothing is published
automatically, and Save is available again after the reconnect.

Logout moves from Spotify Mode to Guest Mode rather than leaving the product:
it cancels auth-bound work, clears user-scoped queries and ends on `/app`.
Successful account deletion ends there too.

## Guest and Spotify capabilities

Guests can generate, preview, and transfer playlists through Soundiiz. Signed-in
users can also publish to Spotify, use the Library and Stats, and control
playback. Spotify tokens never reach the browser: authentication is an
HTTP-only session cookie set by the API, and requests use
`credentials: 'include'`.

## Create with AI

`VITE_AI_CREATION_ENABLED` decides whether `/app/ai` and its navigation item
exist: `true` shows them, any other non-empty value hides them, and an unset
value follows the build mode (on in development, off in production builds).
Production deploys set it to `true`. It is a build-time value, not a runtime
switch.

The browser never calls the AI service. All AI requests go to the API under
`/api/ai/sessions`, and the AI service is not reachable from a browser. A Guest
session's access key is kept in `sessionStorage` for the tab and sent only in
the `X-Ai-Session-Key` header. See
[`docs/engineering/ai-data-handling.md`](../../docs/engineering/ai-data-handling.md).

## Stack

React 19, Vite, TypeScript, React Router, TanStack Query, React Hook Form and
Zod, Tailwind CSS 4, and Zustand.

- **Server state** goes through TanStack Query.
- **Zustand** holds `stores/playlist-run-store.ts` (the single in-flight or
  finished Mix/Discover generation, which survives navigation inside the app
  but not a refresh), `stores/generation-store.ts` (epoch and
  `AbortController` for Create with AI) and `stores/auth-store.ts` (current
  user; its migration to TanStack Query is tracked in the code conventions).
- **Design system**: Tailwind tokens in `src/index.css` (charcoal and amber
  palette), primitives in `src/components/ui/`.
- **i18n**: English, Spanish, and Brazilian Portuguese in `src/i18n/locales/`.
  `?lang=en|es|pt` selects a language (see the root README).
- **Contracts**: request and response types are inferred from
  `@blendify/contracts`; `src/lib/api.ts` parses responses with its schemas.

## Configuration

```bash
cp apps/web/.env.example apps/web/.env
```

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Public API origin, compiled into the bundle. Production builds require an `https` origin without path or trailing slash. Local default: `http://127.0.0.1:3000`. |
| `VITE_AI_CREATION_ENABLED` | Create with AI flag described above. |

Never put a secret in a `VITE_*` variable. Use `http://127.0.0.1:5173` as the
local origin; Spotify rejects `localhost` redirect URIs.

## Commands

Run from the repository root, or with `-w @blendify/web`:

```bash
npm run dev:web                 # Vite on http://127.0.0.1:5173
npm run build:web               # build contracts, typecheck, bundle
npm run test:web                # Vitest (jsdom)
npm run lint -w @blendify/web   # oxlint
npm run test:e2e                # Playwright (Chromium)
npm run visual:ai -w @blendify/web   # Create with AI screenshots for manual review
```

## Tests

Vitest with Testing Library covers components, hooks, and pages. The
Playwright suite in `e2e/` drives a real browser against the dev server and
mocks Blendify's own API with `page.route` (`e2e/fixtures/`). It never reaches
Spotify, Last.fm, Soundiiz, or an AI provider, and it must stay that way.

## Layout

```text
src/
├── pages/        # route-level screens
├── components/   # by feature: ai, artists, genres, layout, playlist, tracks, ui
├── hooks/        # feature hooks (auth, capabilities, AI session, ...)
├── stores/       # Zustand stores
├── lib/          # API client, error mapping, generation streaming, helpers
├── i18n/         # locales and translation helpers
└── assets/       # brand and Spotify attribution assets
e2e/              # Playwright specs and API fixtures
config/           # build-time configuration checks
```

Feature logic lives next to its feature; see
[`docs/engineering/code-conventions.md`](../../docs/engineering/code-conventions.md).
