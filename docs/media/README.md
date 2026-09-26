# Blendify product media

Screenshots used in the root `README.md`. Keep this set small, current, and
free of personal Spotify data.

```text
docs/media/
├── landing.webp          # branded hero (framed mockup, Guest view)
├── mix-artists.webp      # Mix result — artists (Guest)
├── mix-genres.webp       # Mix result — genres (Guest)
├── discover-artist.webp  # Discover result — artist seed (Guest)
├── discover-track.webp   # Discover result — song seed (Guest)
├── guest-transfer.webp   # Guest result + Soundiiz transfer CTA
├── library.webp          # Library (Spotify-connected)
├── stats.webp            # Stats (Spotify-connected)
└── mobile-landing.webp   # landing, mobile viewport
```

## Conventions

- Capture at 1280×800 (desktop) or 390×844 (mobile), in English, with browser
  chrome/devtools hidden.
- Flat Product Tour screenshots (everything except `landing.webp`) are plain,
  uncropped viewport or top-of-page captures — no decorative frame. Only the
  hero gets the branded gradient treatment (see below).
- Never capture a real, personal Spotify session. Guest-mode screens
  (`mix-*`, `discover-*`, `guest-transfer`) use the live app with no session.
  Screens that require a connected account (`library`, `stats`) are captured
  against a mocked API response — a generic user with no display name/avatar
  and representative, non-personal playlist/stats data — using Playwright's
  `page.route`, the same technique as `apps/web/e2e/fixtures`. This avoids
  ever exposing a real account name or listening data.
- Keep every screenshot under ~100 KB; the whole set should stay well under
  1 MB.

## Regenerating a screenshot

Guest-mode screens: open the page in a real browser at 1280×800, English
locale, walk the flow, and capture. Connected-mode screens: write a short
throwaway Playwright script that mocks `**/api/auth/me`, `**/api/playlists`,
and/or `**/api/stats` with fixture JSON before navigating — do not log in
with a real account, and do not commit the script.

## Hero mockup (`landing.webp` only)

The hero is the flat landing screenshot composited into a branded frame
(gradient background + rounded card + shadow). Recreate it with a small
local HTML page (gradient `div` behind an `<img>` of the flat screenshot,
rounded corners, soft shadow) rendered in a browser at 1600×1000 — this is a
one-off compositing step, not a build tool dependency.

## Converting to WebP

`sips -s format webp` does **not** work on this machine (fails with
`Error 13: an unknown error occurred`). Use `cwebp` instead (Homebrew:
`brew install webp`):

```bash
cwebp -q 82 screenshot.png -o docs/media/screenshot.webp
```
