# Whiteboard specification

A collaborative infinite whiteboard. This document is the source of truth for
what is in scope. Each checkbox is ticked only when an automated test proves
the behaviour end to end; the tick links to that test.

Stack: TypeScript, React, Vite. Rendering is a hand-written scene graph drawn
to an HTML canvas. Unit tests run with Vitest, end-to-end tests with Playwright.

## Phase 1: canvas core

Single-user editing of a board in the browser. No networking yet.

### Viewport

- [x] Infinite pan and zoom. Wheel scrolls the board, trackpad pinch (wheel with
      ctrl) zooms around the cursor. Zoom is clamped to 0.05x to 8x.
      Proof: [`e2e/pan-zoom.spec.ts`](e2e/pan-zoom.spec.ts) › `infinite pan and zoom` ›
      `wheel scrolls the board in both axes`, `trackpad pinch zooms around the cursor`,
      `zoom is clamped to the allowed range`,
      `the board extends indefinitely: objects can be placed far from the origin`.

### Objects

- [x] Sticky notes. Click with the sticky tool to place a note; double-click to
      edit its text.
      Proof: [`e2e/sticky.spec.ts`](e2e/sticky.spec.ts) › `sticky notes` ›
      `click places a note, double-click edits its text`,
      `each note gets a colour and several can be placed`.
- [x] Rectangles, ellipses and lines. Drag with the matching tool to create one.
      Proof: [`e2e/shapes.spec.ts`](e2e/shapes.spec.ts) › `rectangles, ellipses and lines` ›
      `drag with the rectangle tool creates a rectangle of that size`,
      `dragging backwards still produces a normalised box`,
      `drag with the ellipse tool creates an ellipse`,
      `drag with the line tool creates a line between the two points`,
      `a plain click with a shape tool drops a default-sized shape`,
      `keyboard shortcuts pick tools`.
- [ ] Connectors. Drag from one shape to another; the connector's endpoints stay
      attached to the shapes' edges when either shape moves.
- [ ] Freehand pen. Drag to draw a stroke made of the pointer path.
- [ ] Text. Click with the text tool to place a text object; double-click any
      text-bearing object to edit it in place.
- [ ] Frames. Drag to create a titled frame; objects inside a frame move with it.
### Editing

- [ ] Multi-select with marquee. Drag on empty board with the select tool to
      select every object inside the marquee; shift-click toggles membership.
- [ ] Group and ungroup. Grouped objects select and move as one.
- [ ] Resize and rotate handles on the selection.
- [ ] Copy and paste, including groups and connectors between copied shapes.
- [ ] Z-order: bring forward, send backward, bring to front, send to back.
- [ ] Undo and redo across every editing operation above.
### Persistence

- [ ] Export the board to PNG.
- [ ] Save the board as JSON and load it back, preserving every object.
### Performance

- [ ] A board of 5,000 objects pans and zooms with a p95 frame time under 16ms.
## Unit coverage

The model underneath is covered by Vitest (`pnpm test`):

- Scene graph CRUD, hierarchy and z-order: `src/model/__tests__/scene.test.ts`
- Hit testing: `src/model/__tests__/hitTest.test.ts`
- Transform maths (pan, zoom, rotate, resize): `src/model/__tests__/geometry.test.ts`
- Undo/redo stack: `src/model/__tests__/history.test.ts`
- Serialisation round trip: `src/model/__tests__/serialize.test.ts`

## Phase 2: collaboration (out of scope for now)

- Real-time multi-user editing.
- Cursors and presence.
- Comments.
