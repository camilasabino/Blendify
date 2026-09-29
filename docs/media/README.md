# Blendify product media

Screenshots used in the root `README.md`. Keep this set small, current, and
free of personal Spotify data. The social preview card lives in
[`docs/brand/`](../brand/) and is described at the end of this file.

```text
docs/media/
├── landing.webp                # branded hero (framed mockup, Guest view)
├── create-with-ai-review.webp  # Create with AI: interpreted request to confirm (Guest)
├── create-with-ai-result.webp  # Create with AI: generated preview (Guest)
├── mix-artists.webp            # Mix result — artists (Guest)
├── mix-genres.webp             # Mix result — genres (Guest)
├── discover-artist.webp        # Discover result — artist seed (Guest)
├── discover-track.webp         # Discover result — song seed (Guest)
├── guest-transfer.webp         # Guest result + Soundiiz transfer CTA
├── library.webp                # Library (Spotify-connected)
├── stats.webp                  # Stats (Spotify-connected)
└── mobile-landing.webp         # landing, mobile viewport
```

`mix-*`, `discover-*`, `guest-transfer`, `library`, and `stats` predate the
Create with AI navigation item, so their top bar shows only Mix, Discover,
Library, and Stats. This is cosmetic. Their refresh is deferred until after the
planned information-architecture / App Home work, so the same surfaces are not
recaptured twice.

## Conventions

- Capture at 1280×800 (desktop) or 390×844 (mobile), in English, with browser
  chrome/devtools hidden.
- Flat Product Tour screenshots (everything except `landing.webp`) are plain,
  uncropped viewport or top-of-page captures — no decorative frame. Only the
  hero gets the branded gradient treatment (see below).
- Never capture a real, personal Spotify session, and never make a real
  Spotify, Last.fm, Soundiiz, or AI-provider call to produce a screenshot. Mock
  Blendify's API at the browser boundary with Playwright's `page.route`, the
  same technique as `apps/web/e2e/fixtures`, and use generic, non-personal
  data: a user with no display name or avatar, representative playlist and
  stats data, and synthetic tracks. Block every request that is not to the
  local dev server.
- Create with AI screens reuse the deterministic session fixtures in
  `apps/web/e2e/fixtures/ai-sessions.ts`, the same ones behind
  `npm run visual:ai -w @blendify/web`. No prompt reaches a model.
- Keep every screenshot under ~100 KB; the whole set should stay well under
  1 MB.

## Regenerating a screenshot

Write a short throwaway Playwright script outside the repository (for example
in a scratch directory) that mocks `**/api/auth/me` and the endpoints the
screen needs, opens the page on the local dev server (`npm run dev:web`), waits
for `document.fonts.status === "loaded"`, and captures the viewport. Do not log
in with a real account, do not use production, and do not commit the script.

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

## Social preview

`docs/brand/social-preview.svg` is the editable source and
`docs/brand/social-preview.png` (1280×640, the size GitHub recommends; PNG,
under 1 MB) is the exported card. It uses the Blendify mark, the charcoal and
amber palette, and the Syne and DM Sans fonts, with no UI screenshot and no
third-party logos.

To re-export, open the SVG in a browser at 1280×640 with network access (it
loads the two Google Fonts) and save a PNG screenshot. GitHub does not read the
file from the repository: upload it under Settings → General → Social preview.
