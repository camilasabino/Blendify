# Blendify code conventions

This document records the conventions the codebase already follows (and should
keep following) and the size/smell heuristics used when reviewing changes.
Read it before any architecture, refactoring, or code-review work. Day-to-day
coding sessions only need the short summary in `CLAUDE.md`.

## Monorepo boundaries

- `apps/api`, `apps/web`, and `packages/contracts` are separate concerns.
  Nothing in `apps/api` imports from `apps/web` or vice versa; both only
  depend on `@blendify/contracts`. Keep it that way — this boundary is clean
  today, verified by grepping for cross-app imports.
- `packages/contracts` is the source of truth for shared runtime contracts
  (Zod schemas + inferred types) used at the API/web HTTP boundary, plus the
  API ↔ AI-service wire contract (`ai-service.ts`, exported as
  `@blendify/contracts/ai-service`). The HTTP contracts are intentionally a
  single `index.ts` today; split it into per-domain files
  (recipe/requests/playlists/errors/stats/stream) only if it keeps growing —
  Zod inference already makes the current size functionally fine.
- Only shared **boundary** contracts belong in `packages/contracts`. Domain
  entities and value objects (`apps/api/src/domain/**`) are allowed — and
  expected — to diverge from the wire DTOs (e.g. `Track` entity vs.
  `TrackSchema`); that split is intentional, not duplication.

## AI service (`apps/ai`, Python)

- Toolchain: `uv` (dependencies and Python version), `ruff` (lint and
  format), `pytest`. Don't add overlapping tools.
- Layout by concept: `models/` (Pydantic wire models), `providers/`
  (model-provider port and adapters), `prompts/` (versioned prompt
  templates), `interpretation/` (orchestration), `api/` (FastAPI routes, auth,
  error handlers), `config/`. `evals/` (outside `app/`) holds the versioned
  intent and refinement eval datasets and the manual real-model runner.
  No `utils.py`/`helpers.py`/`constants.py`.
- Type every public function and boundary. Wire models extend `WireModel`
  (camelCase aliases, `extra="forbid"`, every field required — absence is
  `null` or `[]`).
- The same rules as TypeScript apply: named constants at the narrowest owner,
  no explanatory comments, tests assert behavior, no real model or provider
  calls in tests.
- Provider-content firewall: AI-service request models carry only
  user-authored text. Never add fields for provider IDs, URLs, artwork,
  catalog results, playlists, or user data.

## API: hexagonal architecture

- `domain/` — entities, value objects, domain services (`strategies/` for
  allocation/ordering, `specifications/` for duplicate/alternate-version
  rules), and repository *ports*. No NestJS, Prisma, Axios, or HTTP objects
  here.
- `application/` — use cases and application services that orchestrate domain
  logic through ports.
- `infrastructure/` — adapters: Spotify/Last.fm HTTP clients, Redis cache,
  Prisma repositories, auth. Provider-specific types and error handling stay
  here; convert provider errors into domain/application-semantic errors
  (`CatalogUnavailableError`, `BusinessRuleError`, etc.) before they cross into
  `application/`.
- `presentation/` — controllers, guards, pipes, the exception filter. One
  normalized error envelope for every response; never leak a raw provider
  error, stack trace, or Axios error shape to a client.
- `modules/` — NestJS wiring only.
- **Known boundary leak to watch**: `domain/genre/catalog-resolve.ts` checks
  Spotify-branded error codes (`SPOTIFY_QUOTA_EXCEEDED`, `SPOTIFY_RATE_LIMITED`)
  directly in a domain file. It's low-risk today (string comparison, no SDK
  dependency) but is conceptually a provider leak into the domain layer — see
  "Deferred refactors" below.

## Web: feature-oriented organization

- Pages (`pages/`) orchestrate: they wire hooks and components together and
  hold minimal state of their own.
- Feature-specific logic belongs next to the feature (e.g.
  `components/playlist/library-list-helpers.ts`), not in `lib/utils.ts` or
  another generic bucket.
- State:
  - **TanStack Query** for anything that is server state (fetched from the
    API), including its loading/error/staleness.
  - **Local React state** for local UI state (open/closed, form drafts,
    hover).
  - **Zustand** only for state that is genuinely shared across components and
    is not a mirror of server data — e.g. `stores/playlist-run-store.ts`
    (the one active or finished Mix/Discover generation with its
    `AbortController`) and `stores/generation-store.ts` (epoch +
    `AbortController` for Create with AI). Those are correct uses of Zustand.
  - **Client generation lifecycle (Mix/Discover)**: the run lives in
    `stores/playlist-run-store.ts`, above the route components, and is driven
    by `lib/playlist-run-coordinator.ts` (request, progress, terminal state,
    Library/Stats invalidation). Route components only read it through
    `hooks/use-playlist-run.ts`; never own a generation in component state or
    a component-scoped mutation, and never abort it on unmount. Only logout,
    account deletion, or discarding a Guest run when leaving its page cancels
    it. The run is memory-only by design: there is no operation ID or status
    endpoint, so it survives navigation inside the tab but not a refresh.
  - **Known violation to fix separately**: `stores/auth-store.ts` +
    `hooks/use-auth.ts` model the current user (server state fetched from
    `/api/auth/me`) in Zustand, with a hand-rolled retry backoff, in-flight
    de-dupe, and visibility-based refetch — all things TanStack Query's
    `retry`/`staleTime`/`refetchOnWindowFocus` already provide. Do not add new
    server state to Zustand; new remote data goes through TanStack Query.
- `lib/utils.ts` currently mixes genuinely generic helpers (`cn`,
  `copyToClipboard`, formatting helpers) with playlist business rules
  (`PLAYLIST_TRACK_CAP`, `estimateTrackCount`) and artist/track domain
  formatting (`normalizeArtistName`, `toSpotifyUrl`,
  `formatCreditedArtists`). New code should NOT add to this file; put
  playlist-limit logic in `lib/playlist-generation.ts` and artist/track
  formatting in the relevant feature folder. Migrating what's already there
  is a deferred cleanup (see below), not something to do incidentally.

## Naming

- React components, types, and classes: PascalCase. Hooks: `useX`. Booleans:
  `isX`/`hasX`/`canX`/`shouldX`.
- Backend files use role suffixes: `.controller.ts`, `.use-case.ts`,
  `.service.ts`, `.repository.ts`, `.adapter.ts`, `.strategy.ts`,
  `.specification.ts`, `.port.ts`. Keep using them for new files in
  `application/`, `infrastructure/`, and `domain/services/`.
- Avoid vague names (`data`, `info`, `helper`, `manager`, generic `utils`)
  when a precise domain concept exists. Don't rename existing files/symbols
  purely for cosmetic consistency — only rename when touching that code for
  another reason, or when the name is actively misleading.

## Imports, control flow, and whitespace

- **Absolute imports across directories.** `apps/api` and `apps/web` both use
  a single `@/*` → `src/*` path alias for any import that crosses a directory
  boundary (`import { Track } from '@/domain/track/track.entity'`, not
  `'../../domain/track/track.entity'`). Same-directory relative imports
  (`./x`) are fine — they describe colocated implementation. Cross-workspace
  imports still go through the public package name (`@blendify/contracts`)
  and never reach into another workspace's internals.
  `apps/api` resolves the alias via `tsconfig.json` paths, a
  `moduleNameMapper` entry in Jest, `tsc-alias` rewriting `dist/` after
  `nest build`, and a `tsconfig-paths` bootstrap (`tsconfig-paths-bootstrap.js`,
  loaded via `NODE_OPTIONS` in the `start`/`start:dev`/`start:debug` scripts)
  for `nest start`'s own dev/watch output. `apps/web` already resolves it
  through Vite/Vitest's `resolve.alias` and `tsconfig.app.json`.
- **Import grouping.** Order imports as: framework/external packages, then
  `@blendify/*` workspace packages, then `@/`-alias application imports, then
  local relative imports — with a blank line between groups. This is a
  human/code-review convention, not lint-enforced (neither app has an
  import-sorting plugin installed, and one shouldn't be added just for this).
- **Braces are mandatory** for every `if`/`else`/`for`/`while`/`do…while`
  body, even a single-statement one. No inline `if (x) return`, `if (x) throw`,
  `if (x) break`, or `if (x) continue`. This is lint-enforced: `curly: ['error',
  'all']` in `apps/api`'s ESLint config, `"curly": "error"` in `apps/web`'s
  `.oxlintrc.json`. Run `lint:fix` and let Prettier reformat the result.
- **Vertical whitespace is a human convention, not a lint rule.** Separate
  distinct logical phases (setup → validation → side effects → result) with a
  blank line; don't leave a validation guard glued to unrelated code that
  follows it. Don't add a blank line inside a guard whose entire body is a
  single `return`/`throw`/`continue`/`break`. Don't mechanically insert blank
  lines everywhere — the goal is visible structure, not padding.
- **Avoid compressed control flow** generally: no nested ternaries, no
  "clever" boolean expressions that hide a branch, no multiple meaningful
  operations crammed onto one line. A simple expression ternary that
  genuinely reads better inline is still fine.

## File and function size (heuristics, not hard limits)

No `max-lines` lint rule. Use these as review signals:

- Source file ~250–300 LOC: inspect for mixed responsibilities.
- Source file >400–500 LOC: strong signal to consider decomposition.
- Function ~40–60 LOC: inspect complexity/responsibility.
- React component ~150–200 LOC: check whether data fetching, business logic,
  handlers, and rendering should separate.

A large file is not automatically wrong — e.g.
`components/playlist/generation-result-panel.tsx` (610 LOC) is almost
entirely small, cohesive presentational helpers and subcomponents with no
mixed responsibilities; its size comes from breadth, not entanglement.
Compare that to `components/playlist/create-playlist-form.tsx` (897 LOC),
which does mix zod validation, business rules, two mutations, ~10 pieces of
local state, and four locally-defined subcomponents — that one is a real
decomposition candidate (see "Deferred refactors").

## Comments and JSDoc — strict policy

Default: **do not add comments or JSDoc**. Code should explain itself through
naming, small cohesive functions, explicit types, and clear control flow.

A comment/JSDoc is justified only for:

- a security-sensitive invariant not inferable from the code (e.g.
  `origin-csrf.guard.ts`'s explanation of why the allowed-origin check exists,
  `auth.service.ts`'s note on why `secure: true` works for loopback origins);
- a non-obvious provider/protocol limitation forcing an otherwise strange
  implementation (e.g. Last.fm error code 6/4 meaning "not found", Spotify's
  256 KB cover-image limit, `/items` vs `/tracks` field-stub behavior);
- a documented workaround for external-system or tooling behavior (e.g.
  `title-text.ts`'s note on avoiding nested regexes for a specific Sonar
  rule);
- an intentionally surprising implementation decision where the obvious
  alternative is wrong (e.g. matching by artist ID instead of name to avoid
  homonym collisions).

Before adding one, ask: *would a competent engineer misread or break this
code without it?* If no, don't add it. This codebase already does this well —
the audit that produced this document found only one comment across the
entire API and web source trees that was pure restatement (a `// fall
through` next to an already-obvious empty `catch`), and it has been removed.
Grouping comments inside large literals (e.g. `// Latin & Caribbean` inside
`curated-genres.ts`'s genre list) are borderline under the strict policy but
were kept — they document curation categories, not code behavior, and removing
them would only make the data harder to navigate for no benefit.

## Contracts and types

- Prefer inferring TypeScript types from Zod schemas over hand-written
  duplicates. `@blendify/contracts` is the shared source of truth for
  request/response/error/stats/recipe shapes.
- Domain entities/value objects intentionally have their own shape — that is
  not duplication, it's the ports-and-adapters boundary. Aliasing a domain
  type to a contracts type when they truly are the same thing (see
  `domain/repositories/music-provider.port.ts`'s `PlaybackDevice =
  PlaybackDeviceDto`) is the right pattern when they happen to coincide.
- `any` is effectively already absent from non-test code (`no-explicit-any`
  is disabled in `apps/api`'s ESLint config as a matter of pragmatism, but a
  full-repo audit found zero uses of `any`/`as any`/`<any>` outside test
  files). Keep it that way: prefer `unknown` + narrowing at untrusted
  boundaries over introducing `any`.

## Error handling and logging

- Convert provider/infrastructure errors into semantic errors
  (`CatalogUnavailableError`, `BusinessRuleError`, typed Spotify/quota errors)
  at the infrastructure boundary, before they reach application/domain code.
  Never let a raw Axios error or Prisma error escape to a controller.
- A `catch` that swallows an error into a fallback (return `[]`/`null`, use a
  cached/in-memory value) must log at `warn` (or `debug` for expected,
  frequent conditions) so the failure is still visible operationally.
  Several catches in the Spotify/Last.fm resolution paths were missing this
  and have been fixed to log before falling back
  (`generate-artist-mix.use-case.ts`, `genre-track-catalog.service.ts`,
  `spotify-catalog.client.ts`, `spotify-playlist.client.ts`,
  `health.controller.ts`).
- Not every empty catch needs a log: best-effort, non-diagnostic fallbacks
  (Redis down → in-memory cache, malformed cached JSON → treat as a miss, a
  browser `document.fonts.ready` failing → fall back to system fonts) are
  fine to swallow silently — they represent expected degraded modes, not
  bugs, and logging them would just be noise.
- Never log credentials, tokens, cookies, authorization headers, or full
  request/response bodies containing user data.
  `infrastructure/http/outbound-http.logging.ts` already redacts and
  truncates outbound bodies — extend that mechanism rather than adding ad hoc
  logging around individual HTTP calls.

## Magic values

Name protocol/domain constants instead of inlining them, especially when the
same rule is used more than once (e.g. Spotify's 100-item playlist-add chunk
size, Last.fm's per-call result cap, the 256 KB cover-image limit — all now
named constants in their respective clients). A single well-named constant
used once is still worth it when the number represents an external contract
rather than an arbitrary choice. Don't extract everything, though — `0`/`1`
in obvious length checks or increments, and trivial array indices, can stay
inline.

**Ownership: put a constant at the narrowest level that's still correct.**

- *Function-local* — relevant to one function only, where naming materially
  helps (e.g. `apps/api/src/domain/genre/catalog-resolve.ts`'s
  `ATTEMPT_BUDGET_OVER_FETCH`).
- *Module-level* — belongs to one file/service and nothing else uses it (most
  of `genre-track-catalog.service.ts`'s tuning constants:
  `GENRE_TAG_TRACK_CANDIDATE_LIMIT`, `MIN_TAG_COVERAGE_RATIO`,
  `SEED_ARTIST_FALLBACK_RATIO`, etc.).
- *Feature/domain constants module* — several files in the same feature share
  the exact same semantic rule. Example:
  `domain/genre/genre-generation.constants.ts` holds
  `GENRE_MIX_MAX_TRACKS_PER_ARTIST` because it's the same "cap tracks per
  artist while building a genre mix" invariant in both
  `genre-track-catalog.service.ts` (candidate-pool resolution) and
  `genre-playlist-generation.service.ts` (final selection).
- *Provider constants* — Spotify/Last.fm-specific limits stay owned by that
  client (already the pattern for the 100-item chunk size, per-call cap, and
  256 KB cover limit above).
- *Shared contracts* — only when the constant is genuinely part of the
  API/web wire boundary (e.g. `MAX_ARTISTS`/`MAX_GENRES`/`MAX_TRACKS` in
  `@blendify/contracts`, re-exported by `domain/constants.ts`). Never move a
  backend-only implementation constant into `packages/contracts`.

Do **not** create a generic `constants.ts` dumping ground for unrelated
values. Two files using the same literal number is not, by itself, a reason
to share a constant — share one only when both usages are the *same*
conceptual invariant (see the `GENRE_MIX_MAX_TRACKS_PER_ARTIST` example
above); otherwise a coincidental match (e.g. a search page size and an
unrelated retry budget that both happen to be `10`) must stay two separate,
independently named constants. Use `UPPER_SNAKE_CASE` for module-level
primitive constants.

For repeated string sentinels controlling flow (e.g. a return type of
`T | null | 'stop'` used the same way in more than one function), prefer a
small named type alias with one shared doc comment over duplicating the same
prose JSDoc at every call site — see `SeedFanoutOutcome<T>` in
`genre-track-catalog.service.ts`. Don't introduce a full Result/Either
abstraction for control flow that's local to one file.

## Testing

- Keep using the existing stack: Jest for `apps/api`, Vitest for
  `apps/web`/`packages/contracts`.
- Tests assert behavior/contracts (use case outcomes, schema validation
  rules), not private implementation details — keep doing that.
- Regression-test real bugs; don't add tests that just restate the
  implementation.
- `apps/web/e2e` holds a small Playwright Test browser suite (`npm run
  test:e2e`) covering the handful of journeys that only a real browser can
  protect: Guest bootstrap, a full generation flow, the Soundiiz transfer CTA,
  authenticated navigation, logout (including logout during an active
  generation), Spotify OAuth failure feedback, and the Create with AI flows
  (refinement, destinations, session recovery). It mocks Blendify's own API
  at the browser boundary via Playwright routing (`apps/web/e2e/fixtures`) —
  never real Spotify, Last.fm, Soundiiz, or an AI provider — and runs against
  Chromium only. CI runs it as the `e2e` job. Failure artifacts (trace,
  screenshot) land in `apps/web/test-results/` and `apps/web/playwright-report/`,
  both gitignored.

### Validation environment: functional fixes are local-first

- Reproduce every functional bug locally before fixing it: a failing
  deterministic test, or a local run against the real local HTTP boundary
  (Nest app with the production middleware order, local PostgreSQL/Redis,
  mocked providers, local E2E), with representative inputs measured locally.
- Implement the fix and its regression test locally, and complete all
  functional validation (`lint`, `format:check`, `test`, `build`, and the
  AI-service checks when relevant) before committing or pushing.
- Production is never the primary environment to discover, reproduce, debug or
  iteratively validate a functional bug. A deploy is not required to prove a
  fix that local development can represent meaningfully, and no artificial
  production request should be built just to confirm a code change.
- After a deploy, production checks stay minimal and non-destructive. They
  cover deployment, infrastructure and configuration health, plus integration
  properties that cannot be represented locally: real hosting/networking,
  production OAuth callback and cookie/origin configuration, or an explicitly
  authorized provider integration smoke.
- Production smokes never substitute for missing local regression coverage;
  if a production check finds a functional bug, add the local reproduction and
  regression test first.
- This does not relax the paid-provider rule: real OpenAI/model/provider calls
  still need explicit approval for each run.

## Key smells to keep watching for

- Broad `catch` blocks that swallow a real bug alongside an expected failure
  mode — check whether the caught error type is actually narrow enough.
- A boolean parameter that silently switches a function between substantially
  different behavior (e.g. a "dry run" vs. "permanently delete from Spotify"
  flag) — prefer a named/discriminated option over a bare `boolean` for
  anything irreversible or expensive.
- Duplicated provider-response mapping (two clients independently mapping the
  same Spotify track JSON shape) — a change to one mapper silently doesn't
  reach the other. Not fixed in this pass (see below) because consolidating
  requires reconciling slightly different fallback rules; needs a
  human-reviewed refactor with test coverage on both call sites first.
- Generic-named files (`utils.ts`, `helpers.ts`) accumulating unrelated
  domain logic instead of just true cross-cutting helpers.

## Deferred refactors (not done in this pass)

These are real findings, but each touches call sites broadly enough, or
changes serialized behavior enough, that they need a dedicated, reviewed
change rather than a blind mechanical fix:

1. **`stores/auth-store.ts` / `hooks/use-auth.ts`** — move the current-user
   fetch/refresh lifecycle to TanStack Query; keep Zustand only for anything
   that genuinely isn't server state.
2. **`lib/utils.ts` cleanup** — move `PLAYLIST_TRACK_CAP`/`estimateTrackCount`
   into `lib/playlist-generation.ts`, and artist/track formatting helpers
   into their feature folders.
3. **Large form components** (`create-playlist-form.tsx`,
   `discover-playlist-form.tsx`, `library-item.tsx`, `playlist-preview.tsx`) —
   extract locally-defined subcomponents to files and move
   submit/mutation/retry orchestration into feature hooks.
4. **Duplicated Spotify track mappers** — `mapPlaylistTrack` in
   `spotify-playlist.client.ts` and `mapTrack` in `spotify-catalog.client.ts`
   independently map the same wire shape with slightly different fallback
   rules; likewise the "don't wipe stored tracks on an empty response"
   heuristic is implemented separately in `spotify-playlist.client.ts` and
   `domain/playlist/playlist.entity.ts`.
5. **`catalog-resolve.ts`'s Spotify-branded error codes living in
   `domain/`** — move the provider-specific check to the infrastructure
   boundary and have the domain layer depend only on a
   provider-agnostic quota/unavailability signal.
6. **Contracts schema duplication** — `ArtistMixRequestSchema`,
   `GenreMixRequestSchema`, `DiscoverArtistRequestSchema`, and
   `DiscoverTrackRequestSchema` each repeat the same `popularity`/`orderMode`
   fields instead of extending `GenerationSettingsSchema`; and
   `SimilarArtistSuggestionDto` (API) /`SimilarArtistSuggestion` (web) are an
   identical shape defined twice instead of once in `@blendify/contracts`.
