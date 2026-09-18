# Whiteboard

An infinite collaborative whiteboard. Phase 1 (single-user canvas core) is
specified and tracked in [SPEC.md](SPEC.md); every ticked item links to the
Playwright test that proves it. What comes next is in [ROADMAP.md](ROADMAP.md).

## Stack

- TypeScript, React 19, Vite 7
- Hand-written scene graph rendered to an HTML canvas (`src/model`, `src/render`)
- Vitest for unit tests, Playwright for end-to-end and performance tests

## Setup

Prerequisites: Node.js 22 or newer and pnpm 10. If you use corepack,
`corepack enable` installs the pnpm version pinned in `package.json`.

```
git clone https://github.com/bentindal/miro-clone.git
cd miro-clone
pnpm install
pnpm exec playwright install chromium   # browser for the e2e and perf tests
pnpm dev                                # http://localhost:5173
```

`pnpm e2e` builds the app and serves `dist/` on port 4173 itself, so nothing
else needs to be running. If a previous server is still holding that port, stop
it first or Playwright refuses to start.

## Commands

```
pnpm dev        # start the app on http://localhost:5173
pnpm build      # typecheck and bundle to dist/
pnpm test       # unit tests (Vitest)
pnpm e2e        # end-to-end + perf tests (Playwright, builds and serves dist/)
pnpm perf       # only the 5,000-object frame-time test
pnpm lint       # ESLint
```

## Layout

```
src/model     scene graph, geometry, hit testing, history, serialisation
src/render    canvas renderer (culling, batched low-zoom drawing, selection frame)
src/editor    editor state machine (tools, drags, clipboard, keyboard), React UI
e2e           Playwright specs, one file per SPEC.md item
```

## Keyboard

| Key | Action |
| --- | --- |
| V H R O L N T P C F | Select, hand, rectangle, ellipse, line, sticky, text, pen, connector, frame |
| Wheel / Ctrl+wheel | Pan / zoom (trackpad pinch) |
| Space + drag, middle drag | Pan |
| Two fingers (touch) | Pan and pinch zoom |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo |
| Ctrl+C / X / V / D | Copy / cut / paste / duplicate |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| ] [ } { | Bring forward, send backward, bring to front, send to back |
| G | Toggle grid snap |
| Alt while dragging | Disable snapping |
| Delete, Backspace | Delete selection |
| Esc | Cancel drag, clear selection, back to select tool |
| + - Ctrl+0 Shift+1 | Zoom in, out, reset, fit |
