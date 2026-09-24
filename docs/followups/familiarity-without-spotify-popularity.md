# Follow-up: Familiarity without Spotify popularity

Status: Open
Scheduled: after SPEC 001 M3, before Guest Mode is exposed publicly
Related: `docs/specs/001-guest-and-spotify-modes.md`

## Finding

Spotify Development Mode no longer returns `popularity` for tracks or artists.
A real smoke test against the Development Mode app (market `AR`, Client
Credentials) confirmed the field is absent from `/search` (artists and tracks)
and from `GET /artists/{id}`. Blendify maps the missing value to `0`.

Nothing fails: every popularity-based helper degrades softly
(`rankTracksForMix` keeps the incoming order, `preferPopularTracks` and
`preferRareTracks` fall back to the full pool). But the Familiarity modes
(Popular / Balanced / Rarities) lose differentiation wherever they relied on
Spotify popularity.

## Impact by generation path

| Path | Mode differentiation today |
| --- | --- |
| Artist Mix and Discover Artist (Last.fm artist chart) | Kept: the mode selects the chart window (`catalogPoolBounds`) |
| Genre Mix (Last.fm tag chart) | Kept: the mode selects the chart window; `minPopularity` / `maxPopularity` are inert |
| Genre Mix seed-artist fallback (Spotify search) | Lost: Spotify search order only |
| Artist Mix search fallback (`artist:"…"`) | Lost: Spotify search order only |
| Discover Track (`selectTracksByPopularity`) | Lost: Popular and Rarities produce the same selection; Balanced only adds a light shuffle |
| Alternate-version deduplication | Popularity tie-break is always a tie |

## Proposed direction

Replace Spotify popularity with Last.fm-derived signals where a mode still
depends on it, starting with Discover Track (for example the similarity match
score or chart position/playcount). Keep the change scoped to ranking; do not
alter recipe contracts.
