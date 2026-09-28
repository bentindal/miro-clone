# Roadmap

What a full-featured collaborative whiteboard has that this project does not
yet, ordered by what blocks real use rather than by what is visible. Phase 1
(the canvas core) is complete and tracked in [SPEC.md](SPEC.md).

## Where it stands today

Phase 1 is tested. Phase 1b (tracked in [SPEC.md](SPEC.md)) closed the first
round of editing-quality gaps: a property bar for fill, stroke, width and text
size; elbow and curved connectors with side anchors; snapping with guides,
grid snap, align and distribute; two-finger touch pan and pinch; a focusable,
announced canvas with keyboard object navigation.

Phase 2 (first cut) is in: boards live on a sync server, several people edit
one at once with live cursors and selections, undo is per user, and boards are
shared by anonymous edit or view links. The server runs for free on Cloudflare
Workers with one Durable Object per board; a Node/Postgres flavour exists for
self-hosting.

Phase 3 (editing quality) is in, and the first of phase 4 with it: frames
present as slides, with an order of their own, a presentation mode and a PDF
export.

The interface itself is tracked separately in
[UI-ROADMAP.md](UI-ROADMAP.md), which is complete through UI-6: design tokens,
a floating shell, schema-driven property controls, canvas chrome, dark mode
and density, and one command registry behind the buttons, menus, keyboard,
palette and context menu.

What is still thin:

- **No accounts.** Links are the only credentials; the board list is per
  browser, links cannot be revoked, and roles stop at edit and view.
- **Comments are edit-only.** A "comment" role would need the server to let
  viewers write the `comments` map and nothing else.
- **Connector-to-connector bends** and obstacle avoidance are missing;
  routing is a single mid-point elbow.
- **Text formats one run at a time.** Bold, italic, links and lists are in,
  and sticky notes auto-fit, but there is no font choice and no colour on a
  run of text.
- **Accessibility is a first pass.** Objects are announced and reachable, but
  there is no keyboard resize or rotate, and no high-contrast theme.

## Phase 2: make it a product (persist, share, collaborate)

This is the real gap. Without it nothing else matters. Items marked done
shipped in the first phase 2 PR.

1. Server-side boards: autosave and a Yjs document per board (done); a
   per-browser board list (done); accounts, versioned snapshots.
2. Real-time multi-user editing with Yjs and per-user undo (done).
3. Presence: live cursors with names, remote selection highlights (done);
   follow a user.
4. Sharing: anonymous edit and view links (done); comment role, revocation,
   board-level and workspace-level permissions once accounts exist.
5. Comments: threads anchored to objects or positions, resolve (done);
   mentions, a comment-only role.

## Phase 3: editing quality

Closes the remaining gap that makes the editor feel unfinished. Items marked
done shipped in phase 1b.

1. Floating property toolbar: colours, stroke, font, alignment, sticky colour,
   connector style (done); schema-driven rendering is UI-2 in
   [UI-ROADMAP.md](UI-ROADMAP.md).
2. Connector routing: elbow and curved paths, snap to anchor points, labels,
   arrowhead options (done); connector-to-connector bends, obstacle avoidance.
3. Snapping and smart guides, align and distribute, grid snap, resize
   snapping and equal-spacing guides (done).
4. Sticky notes that auto-fit their text and voting dots (done); tags.
5. Rich text: bold, lists, links, in-place font sizing.
6. Touch and pen input: two-finger pan and pinch (done); palm rejection,
   pressure width for the pen tool.
7. Minimap, zoom to selection; keyboard object navigation (done), keyboard
   resize and rotate.
8. Image and file upload with drag-and-drop and paste from the clipboard.

## Phase 4: content types and structure

Breadth comes from here. Each entry is a new object type in the scene graph
and a real chunk of work.

1. Tables and simple grids.
2. Kanban cards and columns.
3. Mind map with automatic layout.
4. Template gallery (retrospective, user story map, flowchart). Needs the
   property toolbar and connector routing first or the templates look bad.
5. Frames as presentation slides: ordering, presenter mode, export a frame to
   PDF (done, `e2e/slides.spec.ts`). Three things it deliberately does not do:

   - **Presenting is local.** It moves this person's camera and hides this
     person's chrome; the board is told nothing. Everyone watching one
     presenter's screen is a presence feature, not a camera one, and belongs
     with "follow a user" in phase 2 rather than here.
   - **Reordering is a pair of buttons, not a drag.** The list works from the
     keyboard and reads properly out loud, which a drag would have to be
     built on top of anyway. `moveSlide` is the same call either way.
   - **A PDF page is a picture of the frame.** Text goes in as pixels, not as
     text, so it does not select or search in a reader. Real text would mean
     embedding fonts, and the whole PDF writer is 130 lines because it does
     not (`src/editor/pdf.ts`). Deflated RGB rather than a JPEG, so the
     pixels at least stay sharp.

   The order lives on the frames themselves, as a fractional index key per
   frame (`src/model/slides.ts`), not as the z-order: frames are inserted at
   the *bottom* of the z-order so they stay behind their contents, which would
   have made every new frame slide one. A key per frame also means one field
   written per move, and two people reordering at once converge.
6. Embeds: links with previews, video, documents.
7. Facilitation widgets: timer, voting session, estimation.

## Phase 5: platform

Only worth starting once phases 2 and 3 are in daily use.

1. Integrations: issue trackers, cloud drives, design tool imports.
2. Offline editing with sync on reconnect.
3. Native mobile and tablet apps.
4. Enterprise: SSO, audit logs, data residency, admin console.
5. Public API and developer SDK.
6. AI features: summarise stickies, cluster, generate diagrams.

## What not to do, and sequencing risks

- **Do not build widgets before collaboration.** A kanban board nobody can
  share is a spreadsheet with extra steps. Phase 2 comes first even though it
  is the least visible work.
- **Do not add AI features early.** They are the most tempting item and the
  least differentiating, and they need comments, clustering primitives and
  structured objects to act on.
- **Skip video chat and calling.** Large incumbents have it to compete with
  meeting tools. It is a support burden with no strategic value at this stage.
- **Decide on the collaboration model before phase 3.** Every property
  toolbar change, connector reroute and alignment command must become a
  CRDT-safe operation. Building phase 3 on the snapshot model and migrating
  later doubles the work.
- **Performance will regress.** The 5,000-object budget was met with batched
  drawing; rich text, images and elbow connectors each break batching. Keep
  the perf test as a gate and expect to add tile caching during phase 3.

  *Measured, after phase 3 landed all three.* The prediction has not come true
  at this scale. With 500 each of images, formatted stickies, bulleted text and
  elbow connectors in the 5,000, pan holds a p95 of about 8ms and zoom about
  8-10ms, against the 16ms bound. **No tile caching was needed and none was
  added**; adding it now would be a cache with nothing to fix.

  The lesson is about the gate rather than the renderer. For a while
  `e2e/perf.spec.ts` built its 5,000 objects from rects, ellipses, stickies,
  lines and pen strokes alone — green, while no longer covering the content
  the note above says would break it. The mix now carries all three, and the
  test **asserts its own mix** and that the pictures reached the canvas, so it
  cannot quietly narrow back to the shapes that batch well.

Realistic sequencing for one small team: phase 2 is two to three months,
phase 3 another two to three, and phase 4 is open-ended.
