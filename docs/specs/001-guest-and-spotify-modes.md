# Blendify — Guest Mode + Spotify Mode

Status: Proposed
Phase: 1
Scope: Product architecture, authentication model, playlist generation and transfer
AI: Out of scope

## 1. Context

Blendify currently requires Spotify authentication before users can access the application.

This works for authorized development users but prevents Blendify from being deployed as a publicly usable application because Spotify Development Mode restricts which users can authorize against the application's Spotify integration.

The goal of this phase is to decouple:

- using Blendify;
- generating playlists;
- discovering music;

from:

- connecting a Spotify user account;
- publishing directly to that Spotify account.

Blendify will support two operating modes:

1. Guest Mode
2. Spotify Mode

Spotify Mode preserves the current authenticated experience.

Guest Mode allows any visitor to use the core playlist-generation experience without Spotify login and transfer the resulting playlist through Soundiiz.

---

# 2. Product goals

## Primary goal

A visitor to Blendify must be able to:

1. open the public application;
2. use Mix;
3. use Discover;
4. generate a playlist;
5. inspect the generated result;
6. transfer that playlist through Soundiiz;

without authenticating with Spotify.

## Secondary goals

- Preserve the existing Spotify-authenticated experience.
- Avoid maintaining two independent playlist generation implementations.
- Keep Spotify-specific behavior behind explicit capabilities.
- Make the product deployable publicly at a domain such as:
  `blendify.camilasabino.dev`
- Prepare the architecture for Create with AI in Phase 2.
- Preserve the current domain/application architecture where possible.

---

# 3. Non-goals

This phase does NOT include:

- AI playlist generation;
- conversational interfaces;
- LangGraph;
- Python services;
- multi-platform transfer implemented directly by Blendify;
- anonymous Library persistence;
- anonymous Stats;
- guest accounts;
- user registration;
- migration away from Spotify as a catalog source;
- renaming Mix or Discover;
- replacing Spotify Mode;
- implementing Apple Music, Deezer, etc. adapters directly.

---

# 4. Terminology

## Guest Mode

User is not authenticated with Spotify.

Guest Mode may use Blendify's backend and application-level credentials, but has no Spotify user identity or Spotify user token.

## Spotify Mode

User has authenticated with Spotify through the existing OAuth flow.

The current Spotify experience remains available.

## Capability

A feature available only when the current session has the required capability.

Examples:

- `generate_playlist`
- `transfer_playlist`
- `publish_to_spotify`
- `spotify_library`
- `spotify_playback`

The frontend should prefer capability-based behavior over scattering `isAuthenticated` checks throughout components.

---

# 5. User experience

## 5.1 Landing page

The landing page must no longer require Spotify authentication as the primary path into Blendify.

Primary action:

`Try Blendify`

Behavior:

→ `/app/mix`

No authentication required.

Secondary action:

`Connect Spotify`

Behavior:

→ existing Spotify OAuth flow.

Exact wording may be refined later, but the hierarchy is:

Try the product first.
Connect Spotify optionally.

---

# 5.2 Guest application navigation

Guest Mode navigation:

- Mix
- Discover

Utility area:

- language selector;
- `Connect Spotify`.

Guest Mode does NOT expose:

- Library
- Stats
- Spotify account avatar;
- Spotify preferences that depend on persistence;
- playback controls.

Do not show inaccessible navigation items as permanently disabled controls.

Prefer removing capabilities that do not exist in Guest Mode.

---

# 5.3 Spotify Mode navigation

Spotify Mode remains functionally equivalent to the current application:

- Mix
- Discover
- Library
- Stats
- language;
- preferences;
- Spotify account menu;
- logout.

Existing Spotify workflows must continue to work.

---

# 5.4 Mode transition

A Guest user may choose `Connect Spotify`.

Successful OAuth should transition the application into Spotify Mode without requiring a full application restart.

Where practical, preserve the current route.

Example:

Guest:
`/app/mix`

→ Connect Spotify
→ OAuth
→ return to `/app/mix`

A future `returnTo` mechanism may be reused if one already exists.

Logging out returns the user to Guest Mode rather than ejecting them from the application entirely.

Expected behavior:

Spotify Mode
→ Log out
→ Guest Mode
→ remain inside Blendify.

---

# 6. Route model

Current behavior protects the entire `/app` tree.

This must change.

## Public application routes

- `/`
- `/app`
- `/app/mix`
- `/app/discover`

`/app` redirects to:

`/app/mix`

regardless of authentication state.

## Spotify-only routes

- `/app/library`
- `/app/stats`

If a Guest navigates directly to one of these URLs:

Preferred behavior:

redirect to `/app/mix`

and optionally display a non-blocking message:

`Connect Spotify to use your Library.`

Do not send the user back to the marketing landing page.

---

# 7. Authentication architecture

Authentication becomes optional application state rather than an application-wide prerequisite.

Conceptually:

```text
ApplicationSession
├── Guest
└── SpotifyAuthenticated
```

Suggested frontend model:

```ts
type AppMode = 'guest' | 'spotify'
```

Do not duplicate the authenticated state unnecessarily if it can be derived from the existing auth store.

Example:

```ts
const mode: AppMode = isAuthenticated ? 'spotify' : 'guest'
```

Prefer exposing capabilities through a central hook or selector.

Example:

```ts
useCapabilities()
```

Potential result:

```ts
{
  canPublishToSpotify: boolean
  canUseLibrary: boolean
  canUseStats: boolean
  canUsePlayback: boolean
}
```

Avoid sprinkling:

```ts
if (isAuthenticated)
```

through every feature.

---

# 8. Spotify integration separation

The current Spotify integration combines catalog access and user-bound behavior.

Phase 1 should make the distinction explicit.

## 8.1 Application-level Spotify access

Use Spotify Client Credentials for public, non-user-specific catalog requests where supported.

Spotify documents Client Credentials specifically for server-to-server access when user authorization is not required.

Responsibilities may include:

- artist search;
- track search;
- artist metadata;
- track metadata;
- catalog resolution required by playlist generation.

The token must:

- be obtained server-side;
- never be exposed to the browser;
- be cached until shortly before expiration;
- be refreshed transparently.

Conceptual component:

```text
SpotifyAppTokenProvider
```

or equivalent.

---

## 8.2 User-level Spotify access

Existing Authorization Code/session behavior remains responsible for:

- current user identity;
- creating playlists in the user's Spotify account;
- modifying user playlists;
- user Library synchronization;
- playback;
- any endpoint requiring user scope.

Do not replace working user authentication unless necessary.

---

# 9. Domain boundary

Playlist generation must not fundamentally depend on a Spotify user.

Target architecture:

```text
                         ┌──────────────────┐
                         │ Spotify catalog  │
                         │ app credentials  │
                         └────────┬─────────┘
                                  │
Guest / Spotify user ──→ Generation Engine
                                  │
                                  ▼
                          Generated Playlist
                                  │
                   ┌──────────────┴─────────────┐
                   │                            │
            Soundiiz transfer            Spotify publish
               Guest + Spotify              Spotify only
```

The generation result should exist independently from its publication destination.

---

# 10. Playlist model

A generated playlist should conceptually consist of:

```ts
GeneratedPlaylist {
  title
  description?
  recipe
  tracks[]
  cover?
}
```

Tracks must contain enough portable metadata to transfer outside Spotify.

Minimum:

```ts
GeneratedTrack {
  title
  artists: string[]
}
```

Preserve richer current Spotify metadata where available:

- Spotify ID;
- URI;
- album;
- artwork;
- duration;
- external URL;
- ISRC if available.

Do not make Soundiiz fields part of the core domain entity.

Mapping into Soundiiz belongs in an adapter.

---

# 11. Generation behavior by mode

## Guest Mode

Mix / Discover:

1. collect the same recipe/settings currently supported;
2. use app-level catalog access;
3. execute the same generation rules;
4. return a generated playlist;
5. do NOT attempt to create a Spotify playlist;
6. do NOT require a Spotify user ID;
7. do NOT require a Spotify user access token.

## Spotify Mode

Preserve current behavior.

The existing workflow may continue to:

- generate;
- create/publish to Spotify;
- save to Blendify Library;
- update Stats;
- expose Spotify playback;

depending on current settings.

Do not regress current functionality merely to unify the two modes.

---

# 12. Generation vs publication

This phase should make a clear application-level distinction between:

```text
Generate playlist
```

and:

```text
Publish / transfer playlist
```

If the current use cases combine both responsibilities too tightly, refactor them carefully.

Preferred conceptual operations:

```text
GeneratePlaylist
PublishPlaylistToSpotify
CreateSoundiizTransfer
```

The domain generation engine must remain destination-agnostic.

Do not introduce abstractions only for theoretical future providers; introduce them where the Guest/Spotify split creates a real boundary.

---

# 13. Guest result screen

The generated result should use the existing result experience as much as possible.

Guest result state should show:

- playlist title;
- track count;
- generated tracks;
- cover if available;
- recipe/settings summary;
- existing preview capabilities that do not require Spotify user auth.

Primary action:

`Transfer playlist`

or:

`Transfer with Soundiiz`

Secondary actions may include:

- Copy track list
- Create another
- Adjust and recreate

Exact copy can be refined during implementation.

Do NOT label a Soundiiz handoff simply as:

`Save to Spotify`

if the user is about to leave Blendify.

The external transition must be clear.

---

# 14. Soundiiz integration

Use the public Soundiiz Playlist Import API.

Endpoint:

```http
POST https://soundiiz.com/go/import-playlist
Content-Type: application/json
```

Blendify sends:

```json
{
  "title": "Playlist title",
  "sourceName": "Blendify",
  "sourceLogo": "https://blendify.camilasabino.dev/...",
  "description": "...",
  "tracklist": [
    {
      "title": "Track title",
      "artists": ["Artist"]
    }
  ]
}
```

Soundiiz requires:

- `title`;
- `tracklist`;
- 1–200 tracks;
- every track must contain a title.

`artists` is optional according to the API, but Blendify should always send it when available because it improves matching.

Soundiiz returns:

```json
{
  "status": "success",
  "nbTracks": 20,
  "shareUrl": "...",
  "expiresAt": 1234567890
}
```

The share URL expires after 24 hours.

Soundiiz does NOT directly create the playlist through this endpoint. It creates a temporary import page where the user reviews and completes the transfer.

Reference:
https://support.soundiiz.com/hc/en-us/articles/36613501259922--API-Let-your-users-import-any-tracklist-to-Soundiiz

---

# 15. Soundiiz destination strategy

Phase 1 preference:

DO NOT hard-code Spotify as the only destination.

Blendify should initially send no `destination`.

Reason:

Guest Mode exists partly to remove Blendify's dependency on Spotify user authentication.

Letting Soundiiz show the destination selector gives Guest users:

- Spotify;
- Apple Music;
- YouTube Music;
- Deezer;
- other supported services.

This changes Blendify conceptually from:

`Spotify playlist builder`

toward:

`playlist builder`

while Spotify Mode remains a first-class integration.

If product scope requires Spotify-only behavior initially, `destination: "spotify"` can be enabled through configuration rather than embedded deeply in domain logic.

---

# 16. Soundiiz adapter

Soundiiz belongs in infrastructure.

Suggested structure:

```text
domain/
  ...

application/
  ports/
    playlist-transfer.gateway.ts

infrastructure/
  soundiiz/
    soundiiz-playlist-transfer.adapter.ts
```

Conceptual interface:

```ts
interface PlaylistTransferGateway {
  createTransfer(
    playlist: GeneratedPlaylist,
    destination?: string,
  ): Promise<PlaylistTransfer>
}
```

Result:

```ts
type PlaylistTransfer = {
  url: string
  expiresAt: Date
  acceptedTracks: number
}
```

Do not expose the raw Soundiiz response beyond the infrastructure boundary.

---

# 17. API contract

Add a backend endpoint conceptually similar to:

```http
POST /playlists/transfer
```

or:

```http
POST /transfers
```

Request:

```json
{
  "playlist": {
    "title": "...",
    "description": "...",
    "tracks": [...]
  },
  "destination": null
}
```

Response:

```json
{
  "url": "https://soundiiz.com/go/import-playlist/...",
  "expiresAt": "...",
  "acceptedTracks": 20
}
```

Prefer using the shared `@blendify/contracts` package with Zod schemas.

Do not let the browser call Soundiiz directly.

Reasons:

- centralize validation;
- hide implementation details;
- enable observability;
- preserve provider abstraction;
- avoid browser/CORS dependency;
- allow future transfer providers.

---

# 18. Transfer security and validation

The public transfer endpoint must be treated as an unauthenticated public endpoint.

Validate:

- title length;
- description length;
- 1–200 tracks;
- track title length;
- artist count/length;
- payload size.

Reject malformed requests before calling Soundiiz.

Add rate limiting appropriate for a public API.

Do not log complete user-generated payloads at high verbosity.

Do not expose third-party errors directly.

Normalize external failures into Blendify's existing error envelope.

Potential error categories:

- invalid_playlist;
- provider_unavailable;
- provider_rejected_playlist;
- rate_limited;
- unexpected_transfer_error.

---

# 19. Guest abuse protection

Because Guest Mode introduces public endpoints:

Review abuse controls for:

- search;
- generation;
- transfer creation.

Use existing Redis infrastructure when useful.

Potential protections:

- per-IP rate limits;
- short-lived caching;
- maximum request size;
- generation concurrency limits;
- Soundiiz transfer throttling.

Do not introduce CAPTCHA in Phase 1 unless evidence requires it.

---

# 20. Library

Phase 1 Guest Mode has NO Blendify Library.

Guest-generated playlists exist in the current client flow only.

Do not introduce anonymous DB users or browser-persisted Library records.

Spotify Mode Library behaves exactly as it does today.

Future phases may introduce account-independent Blendify playlists, but that is explicitly outside Phase 1.

---

# 21. Stats

Stats remain Spotify Mode only in Phase 1.

Guest generation should NOT alter authenticated user Stats.

Do not create global anonymous Stats.

---

# 22. Preferences

Any preference whose behavior depends on authenticated persistence must only appear when relevant.

Example:

`Save to Library`

is Spotify Mode only.

Guest Mode should not show a meaningless preference.

Language remains available in both modes.

---

# 23. Header / AppShell

Guest:

```text
Logo        Mix · Discover        Language · Connect Spotify
```

Spotify Mode:

```text
Logo   Mix · Discover · Library · Stats   Language · Settings · Avatar
```

Responsive behavior should follow the current approved header system.

Do not redesign the header as part of this phase.

Only introduce the minimum mode-aware differences.

---

# 24. Footer

Existing footer remains available in both modes.

No mode-specific footer required.

---

# 25. i18n

All new user-visible strings must exist in:

- EN
- ES
- PT-BR

Maintain natural localization, not literal translations.

New concepts likely include:

- Try Blendify
- Connect Spotify
- Guest mode messaging
- Transfer playlist
- Transfer with Soundiiz
- Continue with Soundiiz
- Spotify-only feature explanation
- transfer error states

---

# 26. Observability

Add structured observability for:

Guest generation:
- generation mode;
- result count;
- duration;
- success/failure.

Soundiiz:
- request duration;
- accepted track count;
- status;
- error category.

Never log:

- Spotify tokens;
- secrets;
- full authorization headers.

Avoid logging full tracklists unless explicitly needed for debugging.

---

# 27. Testing strategy

## Contracts

Test:

- valid transfer request;
- empty tracklist;
- >200 tracks;
- missing title;
- malformed artists;
- transfer response.

## Application

Test:

- Guest generation does not require Spotify user context;
- Spotify Mode preserves existing behavior;
- transfer use case maps GeneratedPlaylist correctly;
- provider failures become domain/application errors.

## Spotify infrastructure

Test:

- Client Credentials token acquisition;
- token reuse;
- refresh after expiration;
- failed token request;
- app-level catalog calls do not use user tokens.

Do not hit the real Spotify API in automated tests.

## Soundiiz adapter

Mock HTTP.

Test:

- successful response;
- accepted count mapping;
- malformed provider response;
- 4xx;
- 5xx;
- timeout;
- network failure.

Do not call Soundiiz in unit tests.

## API

Test:

Guest:
- Mix accessible without session;
- Discover accessible without session;
- transfer endpoint accessible;
- Library rejected/redirected as appropriate;
- Stats rejected/redirected as appropriate.

Spotify:
- existing authenticated endpoints remain functional.

## Web

Test:

- Guest can enter `/app/mix`;
- Guest nav shows only relevant items;
- Connect Spotify is visible;
- Spotify Mode shows full nav;
- logout transitions to Guest Mode;
- Guest generation renders transfer CTA;
- transfer opens the returned external URL;
- failure state is recoverable.

---

# 28. Manual acceptance tests

## Guest

1. Open Blendify in incognito.
2. Do not authenticate.
3. Open Mix.
4. Search/select seeds.
5. Generate playlist.
6. Inspect result.
7. Click Transfer.
8. Receive a Soundiiz flow.
9. Complete transfer manually.

Repeat for Discover.

## Spotify Mode

1. Authenticate an allowlisted Spotify user.
2. Use Mix.
3. Create playlist using existing Spotify flow.
4. Verify Library.
5. Verify Stats.
6. Verify playback/current supported Spotify behavior.
7. Log out.
8. Confirm application transitions into Guest Mode.

---

# 29. Backwards compatibility

This phase must preserve:

- current recipes;
- Mix behavior;
- Discover behavior;
- playlist naming;
- Library semantics;
- Stats semantics;
- Spotify OAuth;
- existing Spotify publishing.

No existing authenticated capability should be intentionally removed.

---

# 30. Deployment considerations

Production requires:

- public web URL;
- API URL;
- Spotify client ID/secret server-side;
- Last.fm credentials;
- Redis/PostgreSQL as currently required;
- valid Spotify redirect URI for Spotify Mode.

Guest Mode must function even when no Spotify user session exists.

Soundiiz public Playlist Import does not require a Soundiiz API key for this flow.

---

# 31. Architectural success criteria

Phase 1 is complete when:

- `/app/mix` works without Spotify auth;
- `/app/discover` works without Spotify auth;
- playlist generation no longer inherently requires a Spotify user token;
- Guest playlists can be handed to Soundiiz;
- Spotify Mode still behaves as before;
- Library/Stats remain correctly scoped to Spotify Mode;
- auth is optional rather than application-wide;
- generation is clearly separated from publication;
- automated tests cover both modes.

---

# 32. Out-of-scope follow-up

Phase 2 will add:

`Create with AI`

It should consume the same generation/domain abstractions introduced here.

Do not implement AI-specific shortcuts in Phase 1.
