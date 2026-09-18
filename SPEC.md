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
- [x] Connectors. Drag from one shape to another; the connector's endpoints stay
      attached to the shapes' edges when either shape moves.
      Proof: [`e2e/connectors.spec.ts`](e2e/connectors.spec.ts) › `connectors` ›
      `a connector dragged between two shapes attaches to both and follows them`,
      `a connector can start on empty board and end on a shape`,
      `deleting a shape frees the attached connector end at its last position`.
- [x] Freehand pen. Drag to draw a stroke made of the pointer path.
      Proof: [`e2e/pen.spec.ts`](e2e/pen.spec.ts) › `freehand pen` ›
      `dragging draws a stroke that follows the pointer path`,
      `a stroke can be selected by clicking on it and deleted`.
- [x] Text. Click with the text tool to place a text object; double-click any
      text-bearing object to edit it in place.
      Proof: [`e2e/text.spec.ts`](e2e/text.spec.ts) › `text editing` ›
      `text tool places a text object and edits it in place`,
      `committing an empty text object discards it`,
      `clicking elsewhere commits the edit`.
- [x] Frames. Drag to create a titled frame; objects inside a frame move with it.
      Proof: [`e2e/frames.spec.ts`](e2e/frames.spec.ts) › `frames` ›
      `objects inside a frame move with it; the title can be edited`,
      `a frame drawn around existing shapes adopts them and sits behind them`.

### Editing

- [x] Multi-select with marquee. Drag on empty board with the select tool to
      select every object inside the marquee; shift-click toggles membership.
      Proof: [`e2e/marquee.spec.ts`](e2e/marquee.spec.ts) › `multi-select with marquee` ›
      `dragging on empty board selects everything fully inside; shift-click toggles`,
      `a marquee with shift adds to the existing selection`,
      `moving a multi-selection moves every member`.
- [x] Group and ungroup. Grouped objects select and move as one.
      Proof: [`e2e/group.spec.ts`](e2e/group.spec.ts) › `group and ungroup` ›
      `grouped objects select and move as one, ungroup restores them`,
      `groups nest and the toolbar buttons work too`.
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
