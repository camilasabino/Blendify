# Create with AI: data handling and observability

This document describes where Create with AI data goes, what may be logged
about it, and the observability events that exist. It describes the current
implementation; update it together with any change to the AI data flow. The
consumer-facing summary is the Privacy page
(`apps/web/src/pages/privacy-policy-content.ts`).

Guiding rule: **metadata observability, not content observability.** Logs
record what happened (operation, result, typed code, duration, counts,
versions), never what the user wrote or which music was involved.

## Data flow

1. Browser → API: the prompt (≤ 2,000 characters), clarification option IDs,
   refinement text, explicit keep positions, the edited playlist title (only
   on publish/transfer). Every call after creation identifies the session with
   a public id in the path and proves ownership with the `X-Ai-Session-Key`
   header (see "Session identifier and ownership credential").
2. API → AI service (private network, bearer token, `X-Request-Id`): the
   prompt only (`/v1/intent/interpret`), or the AI-safe refinement request
   `{intent, preservation, refinement}` (`/v1/refinement/plan`). Both request
   schemas are strict; anything else is rejected before any network call.
3. AI service → OpenAI: versioned system instructions plus that request, with
   `store=false`, no tools, SDK retries off.
4. OpenAI → AI service → API: a validated structured interpretation.
5. API → Redis: the AI session record (below). No PostgreSQL write.
6. After the explicit Create playlist action, the API resolves seeds and
   generates tracks against Spotify/Last.fm exactly like Mix/Discover.
7. Destinations: publish writes to Spotify (and to the Library only when the
   user keeps "save to library" on, plus usage counters); transfer sends the
   minimum tracklist to Soundiiz.

## Data classification

| Data | Examples | AI model | Redis session | Browser storage | Logs | Event fields | PostgreSQL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| User-authored content | initial prompt | yes | yes (`originalPrompt`) | yes (`sessionStorage`, same tab) | no | no | no |
| | refinement text | yes | no (only its interpretation) | no | no | no | no |
| | artist/track/genre names the user wrote | yes (inside the prompt or AI-safe state) | yes (inside AI-safe state) | via the prompt only | no | no | only if published: Library playlist seeds and usage counters, as for Mix |
| | edited playlist title | no | no | yes (`sessionStorage`) | no | no | only if saved to Library |
| AI-safe structured state | `PlaylistIntent`, `IntentPatch`, preservation, unsupported constraints (may quote user text), clarification | yes (refinement context) | yes | no | no | derived only: `intentKind`, `clarificationReason`, counts | no |
| Provider-backed content | resolved artists/tracks, IDs, ISRC, URLs, artwork, durations, generated playlist, diff, Spotify playlist link, Soundiiz link | never | yes (execution result, pending candidate, destination) | rendered in the tab; not stored | no | derived only: `trackCount`, `candidateTrackCount`, `addedCount`, `removedCount`, `movedCount` | only if published and saved to Library |
| Credentials and secrets | `OPENAI_API_KEY`, `AI_SERVICE_TOKEN`, Spotify access/refresh tokens, `blendify_session` cookie, JWT, AI session access key | never | the access key is hashed into the Redis key, never stored as a value | the access key (`sessionStorage`, `accessKey`); sent only in the `X-Ai-Session-Key` header | no | no | Spotify tokens only (existing auth) |
| Public session identifier | `sessionId` in `/api/ai/sessions/:sessionId` | never | not stored (derived from the access key on each request) | yes (`sessionStorage`, `sessionId`) | no | no | no |
| Safe operational metadata | operation, result, typed error code, durations, prompt version, model, provider, request/token counts, booleans | n/a | n/a | n/a | yes | yes | no |

Notes:

- "Logs: no" includes hashes. There is no prompt fingerprinting.
- The AI session record expires at `createdAt + AI_SESSION_TTL_MS` (30
  minutes, `create-ai-session.use-case.ts`). Every later write uses the
  remaining TTL (`remainingTtlMs`), so no action extends a session. Redis
  rounds TTLs up to whole seconds; reads also reject records past
  `expiresAt`. If Redis is unreachable, the cache falls back to process memory
  with the same expiry.
- `sessionStorage` key `blendify.aiSession` holds exactly `{sessionId,
  accessKey, prompt, playlistTitle}` (`apps/web/src/lib/ai-session-storage.ts`). It is
  cleared on Start over, logout and session expiry, and dies with the tab.
  Refinement text lives only in React state. No AI data uses `localStorage`.
- There is no AI table in `prisma/schema.prisma` and no durable prompt or
  refinement history. Apply only changes the Redis session.
- The AI service never receives provider data: request models carry only
  user-authored text and AI-safe state (contract tests in
  `packages/contracts/ai-service/` and both apps).

## Observability events

All events are single-line JSON. Fields are an explicit allowlist; nothing is
logged by serializing a request, response, session, intent or error.

### API (`apps/api`)

`ai.operation` — one per application operation
(`application/services/ai-observability.ts`, `traceAiOperation`). A thrown
error that the operation did not record becomes `rejected` (typed
`AiSessionError`), `superseded` (`*_SUPERSEDED` codes) or `failed`.

| Operation | Results |
| --- | --- |
| `intent_interpretation` | `review_ready`, `needs_clarification`, `failed`, `rejected` |
| `initial_generation` | `generated`, `reused`, `seed_not_found`, `provider_rate_limited`, `provider_unavailable`, `insufficient_results`, `failed`, `superseded`, `rejected` |
| `refinement` | `candidate_ready`, `candidate_failed`, `needs_clarification`, `unchanged`, `failed`, `superseded`, `rejected` |
| `refinement_apply` | `applied`, `rejected` (for example `AI_REFINEMENT_STALE`) |
| `refinement_dismiss` | `dismissed`, `rejected` |
| `destination_publish` | `published`, `publish_incomplete`, `reused`, `superseded`, `failed`, `rejected` |
| `destination_transfer` | `transfer_prepared`, `reused`, `failed`, `rejected` |

Allowlisted fields: `requestId`, `operation`, `result`, `durationMs`
(monotonic), `errorCode`, `promptVersion`, `intentKind`,
`clarificationReason`, `authenticated`, `trackCount`, `unmetConstraints`
(types only), `candidateAttempted`, `candidateStrategy` (`transform`,
`retain_and_fill`, `regenerate`), `candidateTrackCount`, `addedCount`,
`removedCount`, `movedCount`, `refinementAttempt`, `pendingStatus`,
`savedToLibrary`, `spotifyPlaylistCreated`, `interpretationMs`,
`candidateMs`. `errorCode` must match `^[A-Z][A-Z0-9_]{0,63}$` (otherwise
`INTERNAL_ERROR`); `promptVersion` must be a bounded identifier (otherwise
`unknown`).

`ai.diagnostic` — `lease_lost`, `lease_renew_failed`,
`stale_generation_recovered`, `failure_not_persisted`, `state_not_persisted`,
`publish_interrupted`, `usage_not_recorded`, with `operation`, `requestId` and
an optional typed `errorCode`.

`ai.service_call` — the API ↔ AI service boundary
(`infrastructure/ai/ai-service-intent-interpreter.adapter.ts`): `operation`
(`intent_interpretation`, `refinement_interpretation`), `result`, `outcome`,
`promptVersion` or failure `category` (`timeout`, `network`,
`malformed_response`, `request_rejected`, `not_configured`, or the AI
service error code), `durationMs`, `requestId`.

Rate limits: `request_limit.rejected` with `bucket` (`interpret` covers
interpretation and refinement; `generation` covers generation and publish;
`resolve` covers clarification, Apply and Dismiss; `transfer`;
`generation-concurrency`), `reason`, `retryAfterSeconds`, `identityKind`,
keyed `identityHash`, `requestId`. The per-session refinement cap shows up as
`ai.operation` `rejected` with `AI_REFINEMENT_LIMIT_REACHED`.

`identityHash` is a log label only. It is an HMAC-SHA-256 of the identity key
under a random per-process secret, truncated to 12 hex characters, so it is
intentionally not stable across restarts or replicas and cannot be reversed by
enumerating IPv4 addresses. It is never used to enforce a limit: the limiter
counts on the stable identity key (`u:<userId>` or `ip:<address>`) in the
shared store, so distributed limiting is unaffected (asserted in
`request-limiter.spec.ts`). Use it only to tell clients apart inside one
process lifetime.

### AI service (`apps/ai`)

`app/observability/model_call_log.py`:

- `ai.model_request` — one per provider request: `operation`, `provider`,
  `model`, `promptVersion`, `attempt`, `result` (`ok`, `invalid_output`,
  `timeout`, `rate_limited`, `unavailable`, `misconfigured`), `durationMs`,
  `inputTokens`, `outputTokens`, `totalTokens`, `validationErrorCount`,
  `configurationReason` (bounded enum), `requestId`.
- `ai.model_call` — one per operation: the same identity fields plus `result`
  (`completed`, `failed`), `outcome`, `errorCode`, `modelRequests`, summed
  token counts and `usageComplete`.

Token usage comes only from the SDK response. An invalid structured output
still reports the usage of that request. A timeout or provider error has no
usage (`null`). Totals sum the requests that reported usage;
`usageComplete=false` says at least one request had none. Nothing is
estimated, and no monetary cost is computed here.

`modelRequests` counts model requests; `ai.model_call` counts the
application operation. One interpretation can make up to
`MAX_OUTPUT_VALIDATION_ATTEMPTS` (2) model requests.

## Correlation

The API assigns a random UUID per request (`X-Request-Id` response header,
`AsyncLocalStorage` context), puts it on API events and forwards it to the AI
service. The AI service accepts only a UUID-shaped value (anything else
becomes `null`) and adds it to its events. It is opaque, never an auth
credential, and unrelated to the AI session access key. No session fingerprint
is logged: per-request correlation plus `refinementAttempt` answers the current
questions, and the access key is an ownership secret.

## Session identifier and ownership credential

The Create with AI session has two distinct values (`create-ai-session.use-case.ts`,
`ai-session-credential.ts`, `ai-session-key.decorator.ts`):

- **Access key** (`accessKey`): 32 random bytes, base64url. Possession of it is
  what authorizes a Guest session. It is returned once, in the body of
  `POST /api/ai/sessions`, and afterwards travels only in the
  `X-Ai-Session-Key` request header. It is never placed in a path or query
  string, never returned by later responses and never logged. The server
  stores no copy: the Redis keys are `sha256(accessKey)` (session, generation
  lock, destination claim, refinement lock).
- **Session id** (`sessionId`): the routable identifier in
  `/api/ai/sessions/:sessionId`, derived as a domain-separated SHA-256 of the
  access key truncated to 128 bits. It is public, not an authorization value
  and cannot be used to reach the Redis record or to recover the key.

Every session route requires both: the header must be well formed and its
derived id must equal the path id, otherwise the response is the uniform
`AI_SESSION_NOT_FOUND` 404 (same as an unknown or expired session).
Authenticated sessions additionally require the signed-in owner
(`ownerUserId`), so a leaked key alone does not open them either; Guest
sessions (`ownerUserId = null`) are opened by the key alone.

To read or change a Guest session an attacker must hold the 256-bit access key.
The path id, a request id, a log line or an edge access log entry is not
enough.

The header is a custom header, so cross-origin browser calls send a preflight;
the API reflects the requested headers (`enableFrontendCors`, covered by a
preflight test). The key lives in `sessionStorage` next to the id (same tab,
cleared on Start over, logout and expiry). It is not a cookie, so there is no
CSRF surface added, and Spotify-authenticated and Guest flows use the same
mechanism.

Migration: sessions are 30-minute Redis records and the key derivation is new,
so records and tabs created before this change are simply not found (the web
client discards a stored session without `accessKey`, and old path-token
requests get the uniform 404). No record version bump or compatibility layer
was needed.

Residual: edge access logs record paths, so the session id is visible there
but is harmless. They do not record request headers unless header capture is
explicitly enabled at the provider (do not enable it for `X-Ai-Session-Key`).

## Dimensions and cardinality

There is no metrics backend. Treat `operation`, `result`, `errorCode`,
`provider`, `model`, `promptVersion` (bounded, changes only with a code
release), `intentKind` and `candidateStrategy` as groupable dimensions.
`requestId` and the numeric fields are per-event values, never dimensions.

## Failure isolation

Emission is wrapped in one `try/catch` on each side, so a failing logger or
sink never fails an AI request. Missing usage is `null`.

## Decisions

- **Langfuse: not adopted (deferred).** Structured logs already cover model,
  prompt version, latency, requests, tokens, outcomes and errors. A tracing
  vendor would add another processor for data the privacy design keeps out of
  logs, and its value (prompt/output inspection) conflicts with that design.
  Revisit only with a concrete need; it would have to stay optional and
  receive metadata only.
- **Browser analytics: no AI events.** The web app has no analytics
  abstraction; Cloudflare Web Analytics measures page views only. No vendor
  or event was added.
- **Health endpoints stay content-free.** The AI service `/health` returns
  `status` and `intentInterpretation` availability only.
- **Log retention** is configured in Railway and Cloudflare, outside this
  repository.

## Guard tests

- `apps/api/src/presentation/controllers/ai-sessions.http.spec.ts`
  (`observability`): full Guest and Spotify flows with sentinel prompt,
  refinement, provider track/artist/ID, Spotify URL, title, Soundiiz link,
  token and provider-response values; asserts no sentinel in any log line,
  every `ai.operation` key is allowlisted, the response `X-Request-Id`
  matches, Redis keeps no refinement text and the Library save keeps no
  prompt.
- `apps/api/src/presentation/controllers/ai-sessions.http.spec.ts`
  (`session credential`): the id alone, the id used as key, a key crossed with
  another session's id and the old path-token form are all 404; an
  authenticated session still needs its owner; later responses never contain
  the key; the CORS preflight accepts the header. The sentinel tests also
  assert the key and id never appear in log lines.
- `apps/web/src/pages/ai-playlist-refinement.test.tsx`,
  `ai-playlist-generation.test.tsx`: every AI session request carries the header
  and no URL contains the key.
- `apps/api/src/application/services/ai-observability.spec.ts`: error-code and
  prompt-version sanitation, failure mapping, logger failure isolation.
- `apps/ai/tests/test_model_call_observability.py`: success, retry, timeout,
  misconfiguration, missing usage, request-id validation, sentinel leaks,
  logger failure isolation.
- `apps/api/src/infrastructure/http/outbound-http.logging.spec.ts`:
  content-free outbound URLs.
