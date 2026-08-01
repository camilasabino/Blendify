# Blendify product media

Keep README media focused, current, and free of personal Spotify data.

## Recommended assets

```text
docs/media/
├── landing.webp
├── mix-artists.webp
├── mix-genres.webp
├── discover-artist.webp
├── discover-track.webp
├── library.webp
└── stats.webp
```

Use a 16:9 viewport at 1440 × 900 or 1280 × 800. Capture screenshots in the same language and browser size so the set feels consistent.

Before recording:

1. Use a dedicated demo Spotify account.
2. Prepare recognizable artists and a short generated playlist.
3. Hide bookmarks, browser extensions, email addresses, and profile details.
4. Keep the pointer movement deliberate and the recording under 12 seconds.
5. Prefer one flow: select seeds → generate → inspect the result.

## Screenshots

Browser DevTools can set an exact viewport. Capture PNG first, then create a smaller WebP:

```bash
cwebp -q 82 landing.png -o docs/media/landing.webp
```

On macOS, `sips` is available without extra dependencies:

```bash
sips -s format webp landing.png --out docs/media/landing.webp
```

## Animated demo

Record a short MP4 or MOV with the macOS screenshot toolbar (`Shift + Command + 5`), QuickTime, or another screen recorder. Convert it with `ffmpeg`:

```bash
ffmpeg -i blendify-demo.mov \
  -vf "fps=12,scale=1280:-2:flags=lanczos" \
  -loop 0 \
  -an \
  docs/media/blendify-demo.webp
```

If a GIF is required:

```bash
ffmpeg -i blendify-demo.mov \
  -vf "fps=12,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 \
  docs/media/blendify-demo.gif
```

Animated WebP is preferred because it is usually much smaller than GIF.

## README embed

Link each preview to its full-size asset so details remain accessible:

```html
<p align="center">
  <a href="docs/media/landing.webp">
    <img src="docs/media/landing.webp" alt="Blendify landing page" width="960" />
  </a>
</p>
```

Optimize assets before committing. A practical target is under 500 KB per screenshot and under 5 MB for the animated overview.
