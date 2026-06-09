# cre8 — a PICO-8 art studio

A browser-based tool for making **PICO-8** game art: characters, animations, and
(soon) tiles and maps. Draw by hand on the fixed 16-colour palette, **turn any
image into pixel art**, get **animation suggestions** from a single pose, and
**export straight into a PICO-8 cart**.

No install, no build step, no account. It's plain HTML/JS — open the file and go.

## Run it

```bash
# from the project folder, any one of these:
python3 -m http.server 8000      # then open http://localhost:8000
# ...or just double-click index.html in your browser
```

A server is recommended (some browsers restrict `file://`), but the app is
designed to work either way, and it autosaves your project to the browser's
local storage.

## What it does today

- **Sprite / character editor** — pencil, eraser, fill, eyedropper, line and
  rectangle tools on an 8/16/32/64-pixel canvas, with the exact PICO-8 palette,
  an 8×8 sprite grid overlay, **mirror-X** drawing, and **onion-skin**.
- **Image → pixels** — load a photo or drawing and convert it to PICO-8 colours
  (resize, brightness/contrast, optional Floyd–Steinberg dithering). This is the
  offline "translate an input image to pixel information" engine — it needs no
  API key.
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

## Roadmap

- Tile / map editor (paint a tilemap, export the `__map__` section).
- Undo/redo history.
- Save/load project files (`.json`) and full `.p8` import.
- **Generative AI** — see below.

## Adding generative AI (extension point)

Today's image conversion is fully algorithmic and offline. To go further —
"generate a character from a text prompt" or "imagine 8 walk frames from this
one drawing" — you plug in an image-generation model. That step needs an
external service and an API key, which is a decision (cost, which provider)
rather than something bundled in.

The integration point is intentionally small: produce an `HTMLImageElement` (or
raw RGBA), then hand it to the existing pipeline, which already turns any image
into PICO-8 pixels:

```js
// pseudo-code for a future js/ai.js
async function generate(promptOrImage) {
  const img = await callYourImageModel(promptOrImage); // returns an Image
  const frame = Importer.convert(img, project.w, project.h, { dither: true });
  project.frames[project.active] = frame;
}
```

So the algorithmic converter (`Importer.convert`) is also the "last mile" for
any generative backend — whatever creates the picture, this is what makes it
PICO-8-legal. Tell me which provider you'd like and I'll wire it in.
