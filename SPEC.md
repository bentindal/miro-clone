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
- [x] Resize and rotate handles on the selection.
      Proof: [`e2e/handles.spec.ts`](e2e/handles.spec.ts) › `resize and rotate handles` ›
      `dragging a corner handle resizes, an edge handle resizes one axis`,
      `dragging past the opposite edge flips instead of collapsing`,
      `dragging the rotate handle rotates around the centre`,
      `a multi-selection scales all members together`.
- [x] Copy and paste, including groups and connectors between copied shapes.
      Proof: [`e2e/clipboard.spec.ts`](e2e/clipboard.spec.ts) › `copy and paste` ›
      `pastes copies offset from the originals with their content`,
      `copying a group with a connector keeps the copy wired together`,
      `cut removes the originals and paste brings them back`.
- [x] Z-order: bring forward, send backward, bring to front, send to back.
      Proof: [`e2e/z-order.spec.ts`](e2e/z-order.spec.ts) › `z-order` ›
      `bring forward, send backward, bring to front and send to back reorder the stack`.
- [x] Undo and redo across every editing operation above.
      Proof: [`e2e/undo-redo.spec.ts`](e2e/undo-redo.spec.ts) › `undo and redo` ›
      `every editing operation can be undone and redone in order`,
      `a new edit after undo discards the redo branch; toolbar buttons mirror the keys`.

### Persistence

- [x] Export the board to PNG.
      Proof: [`e2e/export-png.spec.ts`](e2e/export-png.spec.ts) › `export to PNG` ›
      `downloads a PNG covering every object on the board`,
      `an empty board still exports a valid image`.
- [x] Save the board as JSON and load it back, preserving every object.
      Proof: [`e2e/save-load.spec.ts`](e2e/save-load.spec.ts) › `save and load board JSON` ›
      `saving downloads JSON and loading it restores every object`,
      `loading a malformed file reports an error and leaves the board alone`.

### Performance

- [x] A board of 5,000 objects pans and zooms with a p95 frame time under 16ms.
      Proof: [`e2e/perf.spec.ts`](e2e/perf.spec.ts) ›
      `board with 5,000 objects pans and zooms under 16ms p95`.

## Phase 1b: editing quality

Closes the gaps listed in [ROADMAP.md](ROADMAP.md) under "Where it stands
today". Same rule as phase 1: a tick needs a passing end-to-end test.

- [x] Property editing. A floating bar above the selection edits fill, stroke,
      stroke width, sticky colour, and text size and colour, for one object or
      a multi-selection, as single undo steps. Styles persist in the board file.
      Proof: [`e2e/properties.spec.ts`](e2e/properties.spec.ts) › `property editing` ›
      `fill, stroke and stroke width of a selected shape can be changed and undone`,
      `a custom colour applies through the colour input`,
      `a multi-selection applies the change to every shape that supports it`,
      `sticky colour and text font size have their own controls`,
      `the bar follows the selection and hides while dragging or with nothing selected`,
      `styles survive save and load`.
- [x] Connector routing and anchors. Connectors are straight, elbow (orthogonal
      with perpendicular stubs) or curved; each end attaches automatically or to
      a fixed side. Dragging from near a side midpoint pins that side. The style
      and anchors are editable from the property bar.
      Proof: [`e2e/connector-routing.spec.ts`](e2e/connector-routing.spec.ts) › `connector routing and anchors` ›
      `dragging from a side anchor pins the connector to that side`,
      `dragging from the middle of a shape leaves the anchor automatic`,
      `elbow and curved styles can be chosen from the property bar and are remembered for new connectors`,
      `anchors can be changed from the property bar`.
- [x] Snapping and alignment. Moving objects snaps to the edges and centres of
      nearby objects with visible guides (Alt disables); optional grid snap;
      align and distribute commands for multi-selections.
      Proof: [`e2e/snapping.spec.ts`](e2e/snapping.spec.ts) › `snapping and alignment` ›
      `a moved object snaps to a neighbour's edge with a guide, and lands exactly aligned`,
      `centres and opposite edges snap too; holding Alt disables snapping`,
      `grid snap rounds positions to the grid when no neighbour is close`,
      `align and distribute commands arrange a multi-selection and undo as one step each`,
      `distribute needs three objects; align needs two`.
- [x] Touch input. Two-finger pan and pinch zoom on touch screens; single
      finger draws and drags as the mouse does; a second finger cancels a
      single-finger drag.
      Proof: [`e2e/touch.spec.ts`](e2e/touch.spec.ts) › `touch input` ›
      `two fingers moving together pan the board`,
      `spreading two fingers zooms in around their midpoint; pinching zooms out`,
      `a single finger draws and drags like the mouse`,
      `a second finger landing mid-drag cancels the drag and turns it into a pan`.
- [ ] Accessibility. The canvas is focusable, objects can be cycled and
      activated from the keyboard, and selection changes are announced to
      assistive technology.

## Unit coverage

The model underneath is covered by Vitest (`pnpm test`):

- Scene graph CRUD, hierarchy and z-order: `src/model/__tests__/scene.test.ts`
- Hit testing: `src/model/__tests__/hitTest.test.ts`
- Transform maths (pan, zoom, rotate, resize): `src/model/__tests__/geometry.test.ts`
- Undo/redo stack: `src/model/__tests__/history.test.ts`
- Serialisation round trip: `src/model/__tests__/serialize.test.ts`
- Connector anchors and routing: `src/model/__tests__/connectors.test.ts`
- Snapping, align and distribute maths: `src/model/__tests__/snap.test.ts`

## Phase 2: collaboration (out of scope for now)

- Real-time multi-user editing.
- Cursors and presence.
- Comments.
