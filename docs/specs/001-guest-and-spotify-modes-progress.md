# SPEC 001 — Progress

Spec: `docs/specs/001-guest-and-spotify-modes.md`

## Completed

- M0 — Spotify Mode characterization safety net
  - `apps/api/src/presentation/controllers/spotify-mode-generation.characterization.spec.ts`
    drives the real `PlaylistsController`, generation use cases, publisher, and
    genre catalog service over HTTP (JSON and NDJSON) with in-memory port fakes.
  - Covers Artist Mix, Genre Mix, Discover Artist, and Discover Track:
    response contract, recipe, publication calls, `persistToLibrary`, stats,
    progress phases, and failure paths (no tracks, quota, missing user, catalog
    unavailable).
  - Later milestones may change only its wiring, not its assertions.
- M1 — Spotify app token provider
  - `SpotifyAppTokenProvider` obtains Client Credentials tokens server-side.
  - In-memory cache per process, refreshed 60 s before expiry (half the
    lifetime for short-lived tokens); single-flight refresh; failures are never
    cached; no automatic retry against the token endpoint.
  - Token endpoint 429 maps to the existing Spotify rate-limit error.
- M2 — App-level catalog separated from user Spotify operations
  - Domain port `CatalogProviderPort` (`searchArtists`, `searchTracks`,
    `resolveTrack`, `getArtistsByIds`) with
    `CatalogProviderFactoryPort.forMarket(market?)`.
  - `MusicProviderPort` now contains user-bound operations only (playlists,
    library, playback, current user).
  - Generation and search use cases resolve the catalog through
    `forMarket(...)`; `forUser(...)` is used only for publication and other
    user-bound operations.
  - Catalog and user adapters share one `SpotifyApiClient`, so the per-process
    Spotify request throttle stays shared.
  - Search caches are keyed by market.
  - Provider-agnostic `CatalogUnavailableError` distinguishes catalog
    unavailability from genuine empty results.
- M3 — GeneratedPlaylist and separation of generation from Spotify publishing
  - Domain `GeneratedPlaylist` (`name`, `description`, `generation`, `seeds`,
    `tracks`, optional `coverCandidateUrl`). It has no `userId`, no Spotify
    IDs or URLs, no status, no `persistToLibrary`, and no stats fields. It
    validates the same invariants as `Playlist.create`.
  - Pure generation use cases return `GeneratedPlaylist` and have no user,
    publication, library, or stats dependencies:
    `GenerateArtistMixUseCase`, `GenerateGenreMixUseCase`,
    `GenerateDiscoverPlaylistUseCase`. Their input schemas omit
    `coverImageBase64` and `persistToLibrary`.
  - Discover Artist composes `GenerateArtistMixUseCase` directly.
  - `CreateSpotifyPlaylistUseCase` is the Spotify Mode orchestrator. It
    validates the user once, generates, creates the persistent `Playlist`,
    publishes through the unchanged `PublishPlaylistService`, and records
    usage stats derived from the recipe and seeds. The controller calls only
    this use case for `/mix` and `/discover`.
  - Discover progress is wrapped once with `monotonicProgressReporter` and
    shared by generation and publication. Mix progress is forwarded
    unchanged, as before.
  - The M0 characterization suite changed only its provider wiring.
- M4 — Portable track metadata
  - `Track` carries `artists` (credited artists, `{ id?, name }[]`, provider
    order), `isrc?`, and `externalUrl?`.
  - `artistId` / `artistName` keep their meaning: the artist attributed by
    Blendify for generation and allocation. They are not `artists[0]`.
  - Credits normalization is conservative: trim names, drop empty names, keep
    provider order. Dedup only by artist ID, or by normalized name when an
    entry has no ID. Different IDs with equal names stay distinct. With no
    valid credits, `artists` falls back to `[{ id: artistId, name: artistName }]`.
  - `isrc` is trimmed and upper-cased; blank `isrc` / `externalUrl` are absent.
  - Spotify catalog and playlist mappings read `artists`,
    `external_ids.isrc`, and `external_urls.spotify`. None of them is required
    for generation.
  - Search cache entries and persisted playlist JSON store the new fields.
    Entries written before M4 hydrate with the fallback credits and no
    ISRC / external URL. No cache key change and no Prisma migration.
  - `TrackSchema` gains optional `artists`, `isrc`, `externalUrl`; responses
    expose them. `TrackSeedSchema` and recipes are unchanged.
  - Real Development Mode smoke test (market AR, Client Credentials):
    `external_ids.isrc`, `external_urls.spotify`, and multiple credited
    artists are present in `/search` track items and map correctly.

- M5 — Public endpoint protection
  - Shared `RedisConnection` owns the single ioredis client, reconnects with
    backoff (previously a failed connection never recovered), and has a
    500 ms command timeout. `RedisCacheService` keeps its API and still
    degrades to process memory; request limits follow their own policy.
  - `RequestLimitStore` with Redis (Lua) and in-memory implementations:
    - fixed-window `hit`: `INCR` + `PEXPIRE` on first hit + `PTTL` in one
      script; a key without TTL is repaired;
    - generation permits: sorted-set leases scored by Redis `TIME`;
      `acquire` purges expired leases and checks per-client and global caps
      atomically in one script; `renew` extends a live lease only (`ZADD XX`),
      never revives an expired one; `release` removes both entries. Keys share
      the `{gen}` hash tag.
  - `@RateLimit(bucket)` + `RateLimitGuard`; identity is `u:{userId}` when
    `req.user` is set, otherwise `ip:{clientIp}`.
  - `@LimitGenerationConcurrency()` interceptor acquires before the handler
    and releases in `finalize` (success, error, NDJSON stream end). Permits
    are renewed every 10 s with a 30 s lease while the request runs; renewal
    stops on release; a lost permit is logged (`request_limit.permit_lost`),
    and a dead process frees its permits when the lease expires.
  - Applied now to the authenticated routes: `search` (artists + tracks
    search, shared counter), `similar`, `resolve`, `generation`
    (`/playlists/mix`, `/playlists/discover`, plus concurrency).
  - Errors (existing envelope, `details.retryAfterSeconds`, `Retry-After`
    header set by the global filter whenever `retryAfterSeconds > 0`, which
    also adds the header to Spotify quota 429s):
    `RATE_LIMITED` 429, `CONCURRENCY_LIMITED` 429 (5 s),
    `CAPACITY_EXCEEDED` 503 (10 s), `SERVICE_UNAVAILABLE` 503 (5 s),
    `PAYLOAD_TOO_LARGE` 413, `INVALID_JSON` 400, `INVALID_REQUEST_BODY`.
  - Body limits in `presentation/http/body-limits.ts`: default 16 KB, bulk
    64 KB, Spotify generation (cover) 512 KB, public generation 32 KB
    (reserved for M6). Parser errors are answered with the normalized
    envelope.
  - `TRUST_PROXY` parsed strictly in `main.ts` (default `false`; hop count or
    IP/CIDR/keyword list; `true` rejected). Client IP is `req.ip`, IPv4-mapped
    IPv6 unwrapped, validated with `net.isIP`; invalid values fall back to the
    socket address and are logged.
  - Structured, throttled logs: `request_limit.rejected` (bucket, reason,
    identity kind, 12-char SHA-256 identity hash, retry-after),
    `store_unavailable`, `memory_fallback`, `permit_lost`,
    `permit_renew_failed`, `permit_release_failed`, `invalid_client_ip`.
    No raw IPs, user IDs, tokens, cookies, or bodies.
  - Web: `RATE_LIMITED`, `CONCURRENCY_LIMITED`, `CAPACITY_EXCEEDED`,
    `SERVICE_UNAVAILABLE` have localized messages (EN/ES/PT-BR) and are no
    longer reported as Spotify rate limits; search and React Query retry
    treat them like throttling.
  - The M0 suite changed only its wiring (in-memory limiter providers).
  - `redis-request-limit.store.integration.spec.ts` runs only with
    `REDIS_TEST_URL`; verified against the local Redis 7 container
    (fixed window/TTL, concurrent hits, per-client/global caps, release,
    lease expiry, renewal).

- M6 — Guest catalog and generation API
  - Existing catalog routes are public: `GET /api/artists/search`,
    `GET /api/artists/similar`, `POST /api/artists/resolve`,
    `GET /api/tracks/search`, and the curated genre routes
    `GET /api/genres`, `/api/genres/search`, `/api/genres/explore`. Their URLs
    and responses are unchanged.
  - New Guest generation routes `POST /api/generate/mix` and
    `POST /api/generate/discover` (`GenerationController`,
    `GenerationModule`). `POST /api/playlists/mix|discover` keep their
    Spotify Mode meaning and contracts.
  - `OptionalJwtAuthGuard` on catalog (except genres) and Guest generation
    controllers, used only to identify the caller for M5. Missing, expired,
    malformed, foreign-signed, or orphaned sessions are anonymous (no `401`,
    no cookie change, no warning). Unexpected failures (for example a
    database error while loading the session user) also fall back to
    anonymous and log a throttled `auth.optional_session_failed` warning with
    the error name only. The guard runs at controller level, so `req.user` is
    set before `RateLimitGuard` and the concurrency interceptor.
  - `GeneratePlaylistUseCase` owns dispatch by kind and Discover monotonic
    progress (the only place that applies the wrapper). Both
    `GenerationController` and `CreateSpotifyPlaylistUseCase` delegate to it.
    The orchestrator now forwards progress unchanged to publication; this is
    output-equivalent because generation reports at most 90% and publication
    starts at 90%.
  - `GenerationModule` owns the pure generation use cases; `PlaylistsModule`
    imports it. A module test proves `GenerationModule` resolves with only
    catalog, discovery, quota, and limiter providers (no user, publication,
    persistence, or stats ports).
  - Contracts (additive): `GenerateMixRequestSchema` and
    `GenerateDiscoverRequestSchema` derived from the creation schemas with
    `.omit({ coverImageBase64, persistToLibrary })`; they stay strict, so
    publication and internal fields (`market`, `maxTracks`, `displaySeeds`,
    `generation`) are rejected. `GeneratedPlaylistSchema` (`name`,
    `description`, `generation`, `seeds`, `tracks`, `coverCandidateUrl?`) and
    `GeneratedPlaylistStreamEventSchema` (same `progress` / `result` / `error`
    envelope, `result.playlist` is a generated playlist).
    `GenerationStreamEventSchema` is structurally unchanged.
  - `toGeneratedPlaylistResponse` maps the domain `GeneratedPlaylist` with the
    existing track mapper. `writeNdjsonGeneration` is generic over the result
    type only.
  - Guest NDJSON never emits `publishing`; progress tops out at 90% and the
    `result` event is terminal. JSON responses return the generated playlist
    directly (`201`, as Spotify Mode).
  - M5: `search` (artist/track search), `similar`, `resolve`, `generation` +
    concurrency on `/api/generate/*`; genre routes intentionally have no
    application-level limiter (local curated data). `/api/generate/*` use the
    32 KB `publicGeneration` body profile; `/api/playlists/mix|discover` keep
    512 KB. Redis failure policies unchanged.
  - `OriginCsrfGuard` unchanged: public `POST` routes still require the
    frontend origin. It is documented as CSRF protection, not abuse control.
  - Tests: `guest-mode.http.spec.ts` boots real JWT auth, the global origin
    guard, the real body parser, real generation, and the real Spotify
    orchestrator over in-memory fakes. It covers public catalog/genres,
    stale-session handling, `401` for every Library/Stats/Player/publication
    route (anonymous and stale sessions), Guest generation for all four kinds
    (no publication, save, stats, or user lookup), rejected publication and
    internal fields, existing validation, NDJSON progress, origin checks, the
    32 KB limit, identical results with and without a session under different
    limiter identities, the unexpected-failure fallback, M5 buckets, genre
    exemption, per-IP limits, and generation permits. The M0 suite changed
    only its wiring (`GeneratePlaylistUseCase` provider).
  - Web unchanged (additive contracts only).

- M7 — Soundiiz transfer
  - Route `POST /api/transfers` (`TransfersController`, `TransfersModule`),
    body `{ transferToken }` only (strict). Returns
    `{ url, expiresAt, trackCount }` (`201`). No provider field; the raw
    Soundiiz response never leaves the adapter.
  - Transfer authorization: a short-lived signed token issued by
    `/api/generate/*`. `GeneratedPlaylistSchema` gains
    `transfer: { token, expiresAt } | null` (JSON and NDJSON `result`). The
    domain `GeneratedPlaylist` is unchanged; `GenerationController` asks
    `PlaylistTransferTokens` for the offer.
  - Token: JWT HS256 (algorithm pinned on verify), key =
    HKDF-SHA256(`JWT_SECRET`, info `blendify:playlist-transfer-token:v1`),
    `aud` `blendify:playlist-transfer`, `iss` `blendify`, `iat`/`exp`, TTL 1 h.
    Payload `{ v: 1, pl }` where `pl` is the minimal transfer projection
    (title, non-empty description, tracks with title, credited artist names in
    provider order, valid ISRC). No user/session, Spotify ID/URI/URL, recipe,
    or seeds. Payload is re-validated with Zod after verification. Session
    JWTs and transfer tokens are not interchangeable (different key and
    audience). Replay within the TTL is intentional (no jti, no Redis state).
  - Token size cap 48 000 chars (`TRANSFER_TOKEN_MAX_LENGTH`). If the token
    would exceed it (or the projection is invalid, e.g. no tracks),
    generation still succeeds with `transfer: null` and a
    `transfer.token_too_large` / `transfer.token_unavailable` event. Metadata
    is never truncated.
  - Port `PlaylistTransferGateway` (`PLAYLIST_TRANSFER_GATEWAY`), use case
    `CreatePlaylistTransferUseCase` (verify token, call gateway). Adapter
    `SoundiizPlaylistTransferAdapter`: `POST https://soundiiz.com/go/import-playlist`
    with `title`, `sourceName: "Blendify"`, `description` when non-empty, and
    `tracklist[{ title, artists[], isrc? }]`. Not sent: `destination`
    (the user chooses on Soundiiz), `sourceLogo`, `album`, Spotify
    IDs/URIs/URLs, popularity, duration, seeds, recipe, user/session data.
  - Response validation: `status: "success"`, `nbTracks` positive integer not
    above the submitted count, `expiresAt` Unix seconds in the future and at
    most 48 h ahead, `shareUrl` exactly `https://soundiiz.com/go/import-playlist/<16–128 [A-Za-z0-9_-]>`
    (no credentials, port, query, fragment, or non-canonical form). Anything
    else is `TRANSFER_PROVIDER_UNAVAILABLE`. No server-side redirect;
    `maxRedirects: 0` on the outbound client.
  - 10 s timeout, zero automatic retries (a user retry creates another
    temporary link, which is acceptable).
  - Errors: `TRANSFER_TOKEN_INVALID` 400, `TRANSFER_TOKEN_EXPIRED` 410,
    `TRANSFER_PLAYLIST_REJECTED` 422 (Soundiiz 4xx or `status: "error"`),
    `TRANSFER_PROVIDER_UNAVAILABLE` 503 (timeout, network, 3xx, 5xx, upstream
    429, malformed or unsafe response; `retryAfterSeconds` 10, or the
    upstream `Retry-After` sanitized to 1–300 s with a 30 s fallback for
    429). Soundiiz messages are neither returned nor logged.
  - M5: `transfer` bucket 10/600 s per identity, fail-closed in production,
    overridable through `RATE_LIMIT_OVERRIDES`. No concurrency limiter.
    Body profile `transfer` 64 KB on `POST /api/transfers`.
  - `OptionalJwtAuthGuard` identifies the caller for the limiter only;
    `OriginCsrfGuard` and CORS unchanged.
  - Feature gate `GUEST_TRANSFER_ENABLED` (default `false`, only
    `true`/`false`, anything else stops startup), checked only in
    presentation by `GuestTransferGate`: when off, `POST /api/transfers`
    returns `404` before the limiter or the use case runs, and
    `/api/generate/*` return `transfer: null`.
  - Logging: `createOutboundHttp(..., { logBodies: false })` keeps method,
    URL, status, and duration only (existing clients unchanged). Structured
    `transfer.created` (track count, accepted count, duration) and
    `transfer.failed` (category, upstream status, track count, duration).
    Never the tracklist, token, or share URL.
  - Tests: mapping (`transfer-playlist.spec.ts`), tokens (round trip, TTL,
    replay, expiry, tampering, `alg: none`, foreign key, session JWT
    confusion, size cap), adapter (payload, success, timeout, network, 3xx,
    4xx, `status: "error"`, 429 + `Retry-After`, 5xx, malformed, unsafe URL
    and expiry, no sensitive logs), outbound logging option, gate parsing,
    error envelope, `TransfersModule` resolves without catalog, user,
    publication, persistence, or stats ports, and `guest-mode.http.spec.ts`
    (gate on/off, Guest transfer for all four kinds without Spotify side
    effects, NDJSON offer, identical semantics with a session under a user
    identity, stale sessions stay Guest, origin checks, rejected
    caller-supplied fields, tampered/expired/session tokens, 422/503 mapping,
    body limit, `transfer` bucket, production fail-closed). The M0 suite is
    unchanged.
  - Manual smoke test (2026-09-25, local API with
    `GUEST_TRANSFER_ENABLED=true`, real Spotify catalog and Soundiiz):
    `POST /api/generate/mix` (Daft Punk, 2 tracks) returned a 528-char
    transfer token; `POST /api/transfers` returned `201` with a
    `https://soundiiz.com/go/import-playlist/…` URL, `trackCount: 2`, and a
    24 h expiry. Soundiiz answered `200` in about 0.9 s. Logs showed only the
    body-less outbound line and `transfer.created`; no tracklist, token, or
    share URL. The share URL was not opened.

- M8/M9 — Guest Mode and Spotify Mode web experience
  - Status: implementation, automated checks (`npm run test`,
    `npm run lint`, `npm run build`, `npm run format:check`), and manual
    browser QA are complete. Web-only change; no backend, contract, or
    protocol changes. `GUEST_TRANSFER_ENABLED` stays `false` as the committed
    default (`.env.example`); public production Guest transfer stays blocked
    pending the Spotify Developer Policy §III.9 review.
  - Routes: `/`, `/app` (still redirects to `/app/mix`), `/app/mix`, and
    `/app/discover` are public. `/app/library` and `/app/stats` are
    Spotify-only through `SpotifyOnlyRoute`: while the session is unresolved
    it shows a spinner; a Guest is redirected to `/app/mix` with a dismissible
    Spotify-required notice (Library or Stats) and a Connect Spotify action.
    The redirect target is public, so there is no loop. `ProtectedRoute` is
    removed.
  - Auth bootstrap: `useAuthBootstrap()` runs once at the `App` root and owns
    the existing session probe (same retry and visibility behavior).
    `refreshSession` shares an in-flight probe, so StrictMode or several
    consumers mounting never probe twice. `useAuth()` no longer runs effects;
    it reads the existing Zustand store and exposes `login`, `logout`, and
    `refresh`. No second auth state source.
  - Capabilities: `deriveCapabilities` (`lib/capabilities.ts`) is a pure
    function of `user` and `isInitialized`; `useCapabilities` reads the auth
    store. Shape: `mode` (`guest` | `spotify`), `isResolved`, `canGenerate`,
    `canPublishToSpotify`, `canUseLibrary`, `canUseStats`, `canUsePlayback`.
    No Guest user object. Transfer is not a capability: it is result-specific
    (`playlist.transfer !== null`).
  - Header: Guest sees Mix, Discover, language, and Connect Spotify; Spotify
    Mode keeps Mix, Discover, Library, Stats, preferences, and the account
    menu. Account controls stay hidden until the session is resolved.
    Preferences (only `persistToLibrary`) are Spotify Mode only. Landing:
    primary "Try Blendify" (`/app/mix`), secondary "Connect Spotify"; the
    hero demo card represents a Blendify-generated playlist, so it no longer
    shows a Spotify mark.
  - Mode-aware copy: one helper, `generationFormCopy(mode, kind)`, drives
    both forms without duplicating sections. Guest: section "Size", CTA
    "Generate playlist" / "Generating…" / "Generate new playlist", progress
    title "Generating your playlist" with a hint that does not mention
    Spotify, result status "Playlist generated", error title "Couldn’t
    generate the playlist". Spotify Mode keeps "Size and cover",
    "Create playlist", "Playlist ready", and its existing progress copy.
  - Generation: Mix and Discover keep one shared form each. The mode is
    captured at submit time and `lib/playlist-generation.ts` explicitly calls
    `/api/generate/*` (Guest) or `/api/playlists/*` (Spotify); nothing is
    inferred from cookies. The Guest branch never sends `coverImageBase64` or
    `persistToLibrary`; the cover toggle and cover rendering are Spotify Mode
    only. Only Spotify results invalidate `playlists` / `usage-stats`. Submit
    is disabled until the session is resolved.
  - Runtime validation: one `GenerationContract<T>` per mode (stream event
    schema + result schema from `@blendify/contracts`), typed without `any` or
    result casts. JSON responses and NDJSON events are validated with Zod. An
    invalid (or wrong-mode) `result` raises the client error
    `INVALID_GENERATION_RESPONSE` instead of being dropped. The reader treats
    `result` as terminal in both modes and resolves immediately, so the UI no
    longer waits at 90%. Backend progress protocol unchanged.
  - Guest result: inline Guest branch in `GenerationResultPanel` rendering the
    `GeneratedPlaylist`: title, description, track count, total duration,
    `coverCandidateUrl` or the existing fallback tile, and a static
    `GeneratedTrackList` (credited artists, album, duration). It does not use
    `PlaylistPreview`, so no player/device calls. No Spotify publication
    state, "Open in Spotify" playlist link, or copy-link action.
  - Guest result lifetime: local component state only. Copy: "This playlist
    is temporary. It will be lost if you leave this page or refresh it."
    Rendered as light contextual text, not a card. No localStorage, database,
    or global result store.
  - Guest result order: metadata (cover, description, count, duration,
    attribution) → temporary notice → Soundiiz transfer → secondary actions
    (Create another / Try different settings) → track list.
  - Soundiiz transfer: rendered only when `transfer !== null`; otherwise the
    result is complete with no transfer control. Card title "Transfer with
    Soundiiz"; copy: "Soundiiz will open an external page where you can
    choose the destination service and complete the transfer. The playlist
    hasn’t been created on any service yet." Two steps: "Prepare transfer"
    sends `POST /api/transfers` with `{ transferToken }` only; then "Transfer
    prepared for {count} tracks. Available until {date}." (locale date
    format, month/day/time) and an explicit "Continue on Soundiiz" link
    (`target="_blank"`, `rel="noopener noreferrer"`, "opens in a new tab" in
    the accessible name) becomes the primary action and receives focus. No
    `window.open`, no automatic redirect. The token is never displayed or
    logged; the link is used only if it is `https:`. Errors: expired/invalid token → "Generate again"; rejected
    playlist → no retry; provider unavailable → retry with wait label.
  - Spotify attribution: each Guest track with `externalUrl` links to Spotify
    ("Open {track} by {artists} in Spotify"); no URL is built when it is
    missing. The icon is the monochrome white Spotify mark (smaller) so it
    does not compete with the amber hierarchy. The Spotify-derived cover is
    not linked. Nearby factual
    attribution: "Track details and artwork from Spotify." when the cover is
    shown, "Track details from Spotify." otherwise.
  - Login/logout: Connect Spotify uses the existing OAuth flow (callback
    still lands on `/app/mix`). Logout from a Spotify-only route navigates to
    `/app/mix` first, then clears the session and removes user-scoped queries
    (`playlists`, `usage-stats`, `playback-devices`); Mix and Discover stay
    usable in Guest Mode.
  - Errors: localized `CATALOG_UNAVAILABLE`, `INVALID_GENERATION_RESPONSE`,
    `TRANSFER_TOKEN_INVALID`, `TRANSFER_TOKEN_EXPIRED`,
    `TRANSFER_PLAYLIST_REJECTED`, `TRANSFER_PROVIDER_UNAVAILABLE` (with retry
    wait). Provider messages are never shown.
  - i18n (EN / ES / PT-BR): new keys for Connect Spotify, Try Blendify,
    Spotify-required notices, Guest leave/recreate notes, Guest result
    (temporary note, attribution, track list, track link), transfer copy and
    errors, and the new generation errors. `brand.description`,
    `create.subtitle`, and `landing.trust` are neutral for both modes. Unused
    `nav.logIn` and `landing.ctaLogin` removed.
  - Tests (web 118 → 168): single auth probe under StrictMode (verified to
    fail without the in-flight sharing); Guest `/app/mix`, `/app/discover`,
    `/app` redirect; Guest Library/Stats redirect with notice and no loop;
    Guest vs Spotify navigation; Connect Spotify starts OAuth; logout from
    `/app/library` and `/app/mix` into functional Guest Mix; landing CTAs;
    the same `MixPlaylistForm` using `/api/generate/mix` vs
    `/api/playlists/mix` with NDJSON progress and publication fields only in
    Spotify Mode; Discover dispatch for both modes; Guest endpoints, JSON and
    NDJSON validation, cross-schema rejection, terminal `result`;
    `createTransfer` body; Guest result (credited artists, no publication
    state, link-backs, attribution, `transfer: null` as a normal result);
    transfer success/expired/rejected/unavailable; new error mappings;
    capabilities; Guest vs Spotify copy (Size / Size and cover, Generate /
    Create playlist, Playlist generated / Playlist ready, Discover copy).
    Web total 170. Existing Spotify Mode tests changed only their wiring
    (valid stub payload, schema argument, `mode` prop).
  - Missing transfer CTA during QA: root cause was configuration, not a web
    bug. With `GUEST_TRANSFER_ENABLED` unset (`false`), `/api/generate/*`
    returned `transfer: null` (JSON and NDJSON) and `POST /api/transfers`
    returned `404`; with `true` locally, both returned `{ token, expiresAt }`
    and the CTA rendered. No `transfer.token_unavailable` /
    `transfer.token_too_large` events.
  - Manual browser QA (2026-09-25, single origin `http://127.0.0.1:5173`
    matching `FRONTEND_URL`, `GUEST_TRANSFER_ENABLED=true` locally, ES UI):
    - Guest desktop end-to-end: Landing → Try Blendify → Mix → generate →
      Prepare transfer → Continue on Soundiiz → Soundiiz track review →
      destination selection → transfer → destination playlist ready
      (validated by the product owner).
    - Guest Discover (artist seed, 50 target → 48 tracks) with transfer.
    - `transfer: null`: complete result, no empty transfer area.
    - Guest direct `/app/library` and `/app/stats`: redirect to Mix with the
      notice, no loop, dismissible.
    - Spotify Mode regression and logout → functional Guest Mix (validated by
      the product owner with a real Spotify account).
    - 320 / 360 / 390 px and 1280 px: no horizontal overflow on landing, Mix,
      or results (including an expanded 48-track list); at 320 px Connect
      Spotify is icon-only with its accessible name.
    - Keyboard: logical tab order with a visible 2 px focus outline; preparing
      the transfer with Enter moves focus to "Continue on Soundiiz".
    - Long track/artist names (injected through CDP): title wraps, rows
      truncate, full names stay in the link accessible name.
    - No console errors; the transfer token never appears in the DOM; no
      automatic navigation after preparing the transfer.

- M10 — Production deployment and hardening (repository changes done;
  private Railway infrastructure live and verified; public networking,
  frontend, Spotify dashboard and smoke tests pending)
  - Runbook: `docs/deployment.md` (topology, dashboards, env inventory,
    migrations, backups, smoke tests, rollback).
  - Hosting: Railway Hobby (API, PostgreSQL, Redis, one replica) and
    Cloudflare Workers static assets (SPA). The API custom domain
    `api.blendify.camilasabino.dev` is DNS-only (Cloudflare Universal SSL does
    not cover second-level subdomains, and a second proxy would change the
    client-IP chain).
  - Tooling: root `build:contracts`, `build:api` (contracts → Prisma Client →
    Nest), `build:web`; `build` uses them; `pretest` / `pretest:api` build
    contracts, so tests no longer depend on a stale contracts `dist`. `.nvmrc`
    pins Node 22 (CI and production); `engines.node` is `>=22`.
  - Railway Infrastructure as Code: `.railway/railway.ts` (`railway/iac`,
    `railway@3.11.0` root devDependency) declares `postgres`, `redis` and
    `api` (GitHub source at the repository root, Railpack, `build:api`,
    pre-deploy `prisma migrate deploy`, start `node dist/main`, health check
    `/api/health` with 120 s timeout, one replica, restart on failure, watch
    patterns, `PORT=8080`, non-secret variables, database references,
    secrets as `preserve()`). Custom domains are dashboard configuration:
    `railway config plan` rejects custom-domain registration. Deprecated
    Config as Code (`railway.json`) is not used. `npm run check:railway`
    type-checks it offline. Railway project `Blendify` created and linked
    (environment `production`); the first plan (3 to add, no diagnostics)
    was applied. `RAILPACK_NODE_NPM_INSTALL=npm ci` was added and applied
    afterwards (Railpack otherwise runs `npm install`).
  - Settings outside IaC (the helpers cannot represent them) were applied
    with Railway's Public GraphQL API as staged environment patches
    (`environmentStageChanges` → review → `environmentPatchCommitStaged`);
    `railway environment edit --service-config` produced an empty patch.
  - Accepted IaC drift (runbook §4.3): `railway config plan` proposes
    `redis deploy.limitOverride.containers.memoryBytes 536870912 → null`
    (never apply that) and `api deploy.restartPolicyType null → ON_FAILURE`
    (Railway normalizes the default; harmless). No `config apply` without
    reviewing the plan.
  - Live production state (Railway Hobby, `production`):
    - `api`: Node 22, `npm ci`, one replica, `PORT=8080`, production
      validation passing with all four secrets (sealed), private PostgreSQL
      and Redis connections, `/api/health` 200, `GUEST_TRANSFER_ENABLED=false`
      (`POST /api/transfers` 404), no public domain yet. The first deploys
      failed only because secrets were missing or staged after the triggering
      deploy.
    - `postgres`: PostgreSQL 18.6, migration `20260731211000_init` applied by
      the pre-deploy, 5 GB volume, Daily backup with 6-day retention, PITR
      disabled, private only. Resizing the volume from 500 MB to 5 GB
      restarted the service in this project.
    - `redis`: 512 MiB container limit, `maxmemory` 256 MiB, `noeviction`,
      RDB and AOF disabled (template bootstrap kept, `--save 60 1` removed),
      authenticated, private only; the API reconnects automatically after a
      Redis restart.
    - Railway SSH with the registered public key "Camila Mac" is used for
      verification; the gateway host key is verified on first use.
    - Workspace usage limits: soft USD 5, hard USD 15 (the hard limit stops
      workloads).
  - `apps/web/wrangler.jsonc`: assets `./dist`, SPA fallback, custom domain,
    no `workers.dev` or preview URLs. `apps/web/public/_headers`: `nosniff`,
    `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
    `frame-ancestors 'none'`, restrictive `Permissions-Policy`, immutable
    caching for hashed assets. No resource CSP.
  - `VITE_API_URL` is mandatory for production builds (`vite.config.ts` →
    `config/api-url.ts`): https origin without path/trailing slash; http only
    for `127.0.0.1` / `[::1]`. The dev fallback is `http://127.0.0.1:3000`.
    CI sets the production value for the web build.
  - Production environment validation (`ConfigModule` `validate`,
    `src/config/production-environment.ts`, `NODE_ENV=production` only):
    required variables, https `FRONTEND_URL` origin, https redirect URI,
    `JWT_SECRET` ≥ 32 characters and not the example, `TRUST_PROXY` set and
    not `false`, removed variables (`JWT_EXPIRES_IN`, `COOKIE_SECRET`,
    `API_URL`) rejected. CORS reads `FRONTEND_URL` with `getOrThrow`.
    `OriginCsrfGuard` unchanged.
  - Session lifetime: one constant, `SESSION_TTL_SECONDS` (7 days), for the
    JWT `exp` and the cookie `maxAge`; `JWT_EXPIRES_IN` removed. Cookie
    attributes unchanged (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`,
    host-only). `cookie-parser` no longer receives a secret (no signed
    cookies exist).
  - `/api/health`: 200 when PostgreSQL answers, 503 otherwise; Redis and
    external providers are not checked.
  - `enableShutdownHooks()`; Swagger only outside production.
  - Logging: Spotify accounts (`/api/token`) and profile (`/me`) clients use
    `logBodies: false` (the profile response contained email and display
    name); Last.fm bodies are not logged in production.
  - Spotify attribution (§II.4 and Design & Branding Guidelines), second
    pass:
    - Official unmodified Spotify SVGs (white icon, white full logo) replace
      the hand-drawn mark; served as separate files. Icon 21 px everywhere
      (Connect Spotify, account menu, links); the full logo (72 px) in the
      Guest attribution line; the undersized avatar badge was removed.
    - Search-result Spotify links sit beside the `role="option"` element,
      are Tab-reachable while the list stays open, and never select the
      option; 43 px targets keep the exclusion zone.
    - Custom playlist covers (Mix and Discover) are Blendify graphics only;
      Spotify artist/album artwork is no longer composed into them.
    - Library shows only the playlist's own Spotify image: the seed-image
      cover fallback and the publish-time artist-image fallback
      (`fallbackImageUrl`, `coverCandidateUrl`) were removed.
    - Stats no longer shows unlinked Spotify artist photos.
  - Spotify attribution (§II.4 and Design & Branding Guidelines), first
    pass:
    - `Artist` (domain, catalog mapping, search cache, `ArtistSchema`) carries
      optional `externalUrl` from `external_urls.spotify`. Cache entries
      written before M10 hydrate without it (no link until refreshed).
    - Web `SpotifyLink`: monochrome white Spotify icon at 21 px (minimum icon
      size), only for `https://open.spotify.com/…` URLs returned by Spotify.
      Used by artist and track search results, artist chips, the Discover
      seed artist/track, and every Guest track (keyboard behavior and assets
      revised in the second pass).
    - Guest cover: `GeneratedPlaylist.coverArtwork` `{ imageUrl, spotifyUrl }`
      is chosen only from server-side catalog data that carries its own link
      (artist image → artist URL; album art → the same track's URL). Client
      snapshots never supply the link. `GeneratedPlaylistSchema` replaces
      `coverCandidateUrl` with optional `coverArtwork`. Without a linked
      artwork the Guest result shows the Blendify tile.
  - Privacy Policy: public `/privacy` page (EN/ES/PT), linked from the footer.
    Covers Guest processing and IP use for rate limiting, Spotify OAuth data
    and token storage, stored playlists and usage data, cookies and local
    storage, Spotify, Last.fm, Soundiiz (conditional), Cloudflare, Google
    Fonts and Railway, logout vs. deletion, Spotify access revocation, and
    the contact `contacto@camilasabino.dev` (deletion requests from the
    Spotify account email). Manual deletion runbook in
    `docs/deployment.md` §18. Production URL for the Spotify dashboard:
    `https://blendify.camilasabino.dev/privacy`.
  - Env examples: `127.0.0.1` canonical local origin and loopback redirect
    URI; `API_URL`, `COOKIE_SECRET`, `JWT_EXPIRES_IN` removed.
  - Rate limits: M5 defaults unchanged; signals to observe are listed in the
    runbook.
  - Backups: daily PostgreSQL volume backup, manual backup + `pg_dump` before
    migration deploys, periodic restore test; PITR documented as optional.
  - Dependencies: `ms` / `@types/ms` removed from the API (unused since the
    session lifetime became a constant).
  - Pending before M10 is complete: temporary Railway API domain and API
    smoke tests, the `TRUST_PROXY=1` client-IP verification, the API custom
    domain and DNS, the Cloudflare Worker, the Spotify dashboard, and the
    full post-deploy smoke tests in `docs/deployment.md`. The generated
    Railway domain is removed only after those tests pass.

## Decisions

- Catalog always uses Client Credentials, in both Guest and Spotify Mode.
- `SPOTIFY_CATALOG_MARKET` is required and must be an ISO 3166-1 alpha-2 code;
  the API fails at startup otherwise. It is sent on every catalog search.
- Market resolution: explicit market if supplied, otherwise
  `SPOTIFY_CATALOG_MARKET`. Contextual Guest market resolution is revisited at
  the infrastructure checkpoint (M5/M10).
- Local configured market is AR. Production code does not hardcode a market.
- Do not derive market from Spotify `/me` (`country` is removed for Development
  Mode apps). No user country is persisted; no migration was added.
- Catalog operations retry one 401 with a refreshed app token. Invalidation is
  compare-and-invalidate, so an old request cannot drop a newer token.
- Catalog error classification:
  - 401 after the single refresh retry → `CATALOG_UNAVAILABLE`
  - 403 → `CATALOG_UNAVAILABLE`
  - 5xx / network failure → `CATALOG_UNAVAILABLE`
  - app token acquisition failure → `CATALOG_UNAVAILABLE`
  - 429 / local cooldown → existing Spotify quota errors
  - 404 → ordinary not-found behavior (`resolveTrack` returns `null`)
  - 400 → ordinary request failure (unchanged)
- `CATALOG_UNAVAILABLE` maps to HTTP 503 in the normalized error envelope and
  is fatal for generation; it never becomes `null`, `[]`, or `NO_TRACKS_FOUND`.
- User-bound Spotify operations continue to use user tokens.
- Dev Mode batch artist lookup (`GET /artists?ids=`) is not used; artists are
  fetched with individual `GET /artists/{id}` requests.
- A real Spotify Development Mode smoke test (market AR) confirmed token
  acquisition, artist/track search, `GET /artists/{id}`, market propagation, and
  mapping compatibility. `popularity` is absent from all responses.
- M3: the user is validated before any generation work for every kind.
  Discover Artist previously validated the user only after seed and Last.fm
  work, and Discover Track after the Last.fm configuration check; only the
  error reported when two failures coincide changes.
- M3: quota checks are unchanged (Artist Mix and Discover Track check
  upfront; Genre Mix does not). Normalizing them is a separate follow-up.

- M5 defaults (code, overridable): `search` 60/60 s, `similar` 60/60 s,
  `resolve` 20/60 s, `generation` 12/600 s; generation concurrency 2 per
  client, 6 global. `RATE_LIMIT_OVERRIDES` syntax:
  `bucket=limit/windowSeconds[,...]`; unknown/duplicate/malformed/non-positive
  entries stop startup.
- M5 store-unavailable policy depends on bucket cost only, never on
  authentication: `search`/`similar` fail-open in production (throttled
  warning); `resolve`, `generation`, generation concurrency, and future
  `transfer` fail-closed (`503 SERVICE_UNAVAILABLE`). Outside production the
  limiter falls back to process memory.
- M5 uses a fixed window (up to 2× burst at a window boundary is accepted).
- M5 keys IPv6 clients by full canonical address; /64 grouping is deferred.
- M6: catalog stays on the existing URLs (identical behavior in both modes);
  generation gets explicit `/api/generate/*` routes because
  `/api/playlists/mix|discover` mean generate + publish + persist + stats,
  return a different contract, and need a different body limit that cannot
  depend on authentication state.
- M6: optional authentication is identification for rate limiting only. It
  never changes Guest generation semantics or responses.
- M6: curated genre routes are public without an application-level rate
  limit; add a bucket only if there is evidence of abuse.
- M6: no anonymous usage stats and no contextual Guest market.

- M7: Soundiiz documentation re-checked on 2026-09-25 (article updated
  2026-09-24). It now documents optional `album` and `isrc` track fields;
  HTTP status codes, rate limits, and `Retry-After` remain undocumented.
- M7: Spotify Developer Policy §III.9 only allows transfer to another service
  for a user's personal data or the metadata of the user's playlists. Whether
  a Guest playlist generated from catalog metadata qualifies is not explicit,
  so `GUEST_TRANSFER_ENABLED` stays `false` in production until the policy is
  reviewed or clarified. §II.4.b (link back to Spotify when showing metadata)
  applies to the M8/M9 result screen.

## Carried forward to later milestones

- `GeneratedPlaylist` stays destination-agnostic: no stats-specific fields;
  keep `coverImageUrl` only if it is part of the generated playlist concept.
- M3 keeps the design simple: explicit use cases, no speculative frameworks.
- Soundiiz is exposed in both modes: primary action in Guest Mode, secondary
  export in Spotify Mode.
- Before M7: compare a validated playlist payload with a short-lived signed
  transfer token, and verify the Spotify Developer Terms for external transfer.
- Rate limiting uses a custom Redis-backed guard; no silent in-memory fallback
  in production; proxy trust is explicitly configurable.
- M8 and M9 ship as one web delivery.
- Resolved in M8/M9: the web has a dedicated localized message for
  `CATALOG_UNAVAILABLE`.

## Follow-ups

- Resolved before M6: Familiarity no longer depends on Spotify popularity.
  Artist Mix, Discover Artist, and the Genre Mix tag-chart path use the Last.fm
  chart window; Discover Track windows its similar-track pool by Last.fm
  `playcount`. The Genre Mix seed-artist fallback remains a documented
  degraded-path limitation. See
  `docs/followups/familiarity-without-spotify-popularity.md`.
- Tooling (non-blocking): `guest-mode.http.spec.ts` failed once during a
  root `npm run test` run (suite took ~5 s) and passed on four reruns
  (isolated, full API suite twice, root once); the failing test was not
  captured. Investigate a possible timing flake.
- Tooling (non-blocking): make root workspace tests deterministic when
  `@blendify/contracts` changes, so `npm run test` does not depend on a
  previously built contracts `dist`.
- M10 (deployment, depends on final proxy topology):
  - set `TRUST_PROXY` (hop count vs. proxy CIDRs) for the chosen provider;
  - ensure the origin only accepts traffic through the edge, or trust by
    CIDR, otherwise a direct request can spoof one forwarded hop;
  - decide whether an edge client-IP header is needed (not supported in M5);
  - IPv6 /64 grouping of anonymous clients;
  - Redis `maxmemory-policy` must not evict limiter keys (`noeviction` or
    `volatile-*`, or a separate Redis database/instance);
  - tune rate limits and the global generation cap to instance count and
    Spotify quota;
  - contextual Guest market resolution (carried from M2).

## Next

- M10 — private Railway infrastructure live and verified; next: temporary
  API domain, API smoke tests and `TRUST_PROXY` verification, then custom
  domain, Cloudflare and Spotify (see `docs/deployment.md`).
- `GUEST_TRANSFER_ENABLED` remains `false` by default. Production Guest
  transfer remains blocked pending the Spotify Developer Policy §III.9
  review.
- Deferred: OAuth `returnTo` (the callback always lands on `/app/mix`).
- Deferred beyond M7: `destination` preselection, authenticated Spotify Mode
  export by playlist ID, `sourceLogo` (M10, public HTTPS domain), global
  transfer cap and bucket tuning (M10).
