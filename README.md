# cre8 — a PICO-8 art studio

A browser-based tool for making **PICO-8** game art: characters, animations, and
(soon) tiles and maps. Draw by hand on the fixed 16-colour palette, **turn any
image into pixel art**, get **animation suggestions** from a single pose, and
**export straight into a PICO-8 cart**.

No install, no build step, no account. It's plain HTML/JS — open the file and go.

## Run it

**Without AI** (drawing, image import, animation, export — fully offline):

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# ...or just double-click index.html in your browser
```

**With AI** (adds prompt → art and sprite → variations). Needs Node 18+ and an
OpenAI API key:

```bash
OPENAI_API_KEY=sk-... node server/ai-server.js
# then open http://localhost:8000
```

The same server also serves the app, so one command runs everything. Your work
autosaves to the browser's local storage.

## Keyboard shortcuts

`B` pencil · `E` eraser · `G` fill · `I` pick · `L` line · `R` rect · `X` mirror
· `[` / `]` previous / next frame · `Space` play/stop · `Ctrl/⌘+Z` undo ·
`Ctrl/⌘+Shift+Z` redo.

## What it does today

- **Sprite / character editor** — pencil, eraser, fill, eyedropper, line and
  rectangle tools on an 8/16/32/64-pixel canvas, with the exact PICO-8 palette,
  an 8×8 sprite grid overlay, **mirror-X** drawing, and **onion-skin**.
- **Image → pixels** — load a photo or drawing and convert it to PICO-8 colours
  (resize, brightness/contrast, optional Floyd–Steinberg dithering). This is the
  offline "translate an input image to pixel information" engine — it needs no
  API key.
- **Generate with AI** (optional) — type a prompt (or use your current sprite as
  a reference) and the local proxy calls OpenAI's `gpt-image-1`; click any
  result to drop it straight into the pixel converter. Off unless you run the
  server with a key — see *Run it*.
- **Undo / redo** — full history, plus keyboard shortcuts (below).
- **Animation** — a frame timeline with playback preview and FPS control, plus
  **suggestions** that build an animation from one drawn pose: *idle bob, sway,
  walk step, ping-pong, flip*.
- **Export to PICO-8** — copy a ready-to-paste `__gfx__` block, download a
  128×128 PNG sprite sheet, or copy raw frame hex. It also tells you the sprite
  number to use with `spr(n, x, y)`.

## How PICO-8 art works (the short version)

PICO-8 keeps **all** sprite art in a single **128×128** image called the
spritesheet. That image is divided into **256 sprites of 8×8 pixels** (16 across,
16 down), numbered 0–255. Every pixel is just a number 0–15 — an index into the
fixed 16-colour palette.

In a `.p8` cart file (which is plain text) the spritesheet lives in the
`__gfx__` section: **128 lines of 128 hex digits**, one digit per pixel. So
exporting art is literally producing that block of text.

**To get your art into a game:**

1. Use **Copy `__gfx__`** and paste the block over the `__gfx__` section of your
   `.p8` file in a text editor — *or* use **Download PNG sheet** and run
   `import yoursheet.png` inside PICO-8.
2. Draw it in code with `spr(n, x, y)` where `n` is the sprite number shown in
   the Export panel. A 16×16 character spans a 2×2 block of sprites, so you'd
   call `spr(n, x, y, 2, 2)`.
3. Animate by flipping the sprite number each frame, e.g.
   `spr(8 + flr(t()*6)%2, x, y, 2, 2)`.

## Project layout

```
index.html        UI shell
css/style.css     styling
js/palette.js     the 16 PICO-8 colours + nearest-colour matching
js/model.js       project + frame data (a frame is a grid of palette indices)
js/editor.js      canvas rendering + drawing tools
js/importer.js    image -> PICO-8 pixels (resize, dither, quantise)
js/animation.js   playback engine + procedural animation suggestions
js/export.js      pack frames into the 128x128 sheet -> __gfx__ / PNG / hex
js/app.js         wires the UI to everything; autosave
```

## How the generative AI works

Provider: **OpenAI `gpt-image-1`** (chosen because one key covers both
text→image and image-guided edits, it handles clean stylized subjects that
downscale well, and it's simple to proxy). Override with `CRE8_IMAGE_MODEL` if
you want a different OpenAI image model.

Flow:

```
prompt (+ optional current sprite as reference)
   -> server/ai-server.js  (holds OPENAI_API_KEY, calls the model)
   -> PNG result
   -> Importer.convert()    (resize + quantise to the 16 PICO-8 colours)
   -> a PICO-8 frame you can edit
```

The key never reaches the browser — the proxy keeps it server-side. Whatever the
model returns is always run through `Importer.convert`, so the output is always
legal PICO-8 pixels. Files: `server/ai-server.js` (proxy + static host) and
`js/ai.js` (client).

## Roadmap

- Tile / map editor (paint a tilemap, export the `__map__` section).
- Save/load project files (`.json`) and full `.p8` import.
- AI-driven animation (generate a set of pose frames from one sprite).
