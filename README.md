# Clucy website

The public landing page for **Clucy**, the standards-driven AI design partner for architects.

> Points are facts. Lines are rules. Space is the result.

The page is one continuous 3D field of points. As you scroll, the field bends around a small figure standing on Clucy's dot, settles into a measured lattice, condenses into a plan, is read as space, stops at the architect's approval, rises into a building, flows out to the tools, and finally returns to the dot.

## Run it

Needs Node 20 or later.

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check, then build to dist/
npm run preview    # serve the built site from dist/
```

`dist/` is a plain static site with relative paths, so it can be hosted anywhere (GitHub Pages, Netlify, Cloudflare Pages, any web server). Hosting and domain are not chosen yet.

## Project layout

```
index.html                 all page copy, as real HTML (readable without 3D, by screen readers and search)
public/
  favicon.svg              brand favicon (small cut of the Room)
src/
  main.ts                  entry: loads fonts and styles, starts the scene, wires the page behaviours
  scroll/
    chapters.ts            the scroll story: one entry per chapter (camera, flow speed, hold, ground)
  scene/
    scene.ts               the WebGL scene (three.js): paper wipe, field, spatial layers, dot
    shaders.ts             GLSL: every point's path for every chapter is computed on the GPU
    geometry.ts            builds the point data once (deterministic seed)
    plan.ts                the illustrative plan: walls, rooms, doors, routes, windows
    anchors.ts             scene points that page labels pin to
    palette.ts             brand colours used by the scene
  ui/
    video.ts               click-to-load demo video (youtube-nocookie, nothing loads before play)
    pet.ts                 Tile, the Clucy pet: amber eye at the gate, one jump when a build lands
    reveal.ts              closing logo reveal, to the brand motion spec
  lib/
    device.ts              reduced motion, WebGL check, device tier, frame budget
  styles/
    tokens.css             brand tokens (colour, type scale, grid, motion)
    base.css               base elements, header, chapter rail, labels
    chapters.css           the chapters and their panels, phone layout
docs/
  concept.md               the approved concept, chapter by chapter
  brand.md                 how the Clucy brand rules apply to this site
```

To change a chapter: its words are in `index.html` (`<section data-chapter="…">`), its camera, flow speed and timing in `src/scroll/chapters.ts`, and what the points do in `src/scene/shaders.ts`.

## How it behaves

- **Performance.** About 150,000 points on a desktop, 80,000 on a laptop, 40,000 on a phone. Point paths are computed on the graphics card, so the processor only updates a few numbers per frame. If frames run slow, the page steps down to fewer points. Rendering pauses when the tab is hidden. The 3D code loads after the page text.
- **Reduced motion.** With the system's reduced-motion setting, nothing flows: each chapter shows its end state and the logo reveal shows its final frame.
- **No WebGL.** The page shows a still brand picture behind the same text.
- **Phones.** Panels dock at the bottom of the screen and the picture sits above them.
- **Demo video.** Nothing is requested from YouTube until the visitor presses play.
- **Development aid.** Open the page with `?debug` and call `clucyDebug.show(stage)` in the console to draw any chapter at once (stage 0 to 8).

## Content rules

These come from Clucy's own rules and apply to every word and picture on the site:

- No numeric claims (project values, user counts, speed-ups) unless the exact wording is approved first.
- No standards values. Rule cards cite only the fictional *Clucy Test Standard*; plans are illustrative and show no dimensions.
- No book text or page images, and no client names, models or drawings.
- Never claim Clucy certifies compliance. Structural values are "preliminary, engineer to confirm".
- Third-party tools are named in text only, with a trademark line in the footer; no third-party logos.

## Status

- Early-access button is a placeholder until a form service or contact address is chosen.
- No deployment is set up yet.

© 2026 Clucy. All rights reserved.
