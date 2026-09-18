# Whiteboard specification

A collaborative infinite whiteboard. This document is the source of truth for
what is in scope. Each checkbox is ticked only when an automated test proves
the behaviour end to end; the tick links to that test.

Stack: TypeScript, React, Vite. Rendering is a hand-written scene graph drawn
to an HTML canvas. Unit tests run with Vitest, end-to-end tests with Playwright.

## Phase 1: canvas core

Single-user editing of a board in the browser. No networking yet.

### Viewport

- [ ] Infinite pan and zoom. Wheel scrolls the board, trackpad pinch (wheel with
      ctrl) zooms around the cursor. Zoom is clamped to 0.05x to 8x.

### Objects

- [ ] Sticky notes. Click with the sticky tool to place a note; double-click to
      edit its text.
- [ ] Rectangles, ellipses and lines. Drag with the matching tool to create one.
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

## Phase 2: collaboration (out of scope for now)

- Real-time multi-user editing.
- Cursors and presence.
- Comments.
