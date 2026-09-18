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

What is still thin:

- **Persistence is a JSON download.** Close the tab and the board is gone. Undo
  history lives in memory only.
- **Connector labels and connector-to-connector bends** are missing; routing
  is a single mid-point elbow with no obstacle avoidance.
- **Resize does not snap**; only moves do. No smart spacing guides between
  three or more objects.
- **Text is plain.** No bold, lists or links; sticky notes do not auto-fit.
- **Accessibility is a first pass.** Objects are announced and reachable, but
  there is no keyboard resize or rotate, and no high-contrast theme.

## Phase 2: make it a product (persist, share, collaborate)

This is the real gap. Without it nothing else matters.

1. Server-side boards: accounts, a board list, autosave, versioned snapshots.
   The download-based save stops being the primary path.
2. Real-time multi-user editing. A CRDT (for example Yjs) is the recommended
   model over the current snapshot approach. Snapshot-based undo has to become
   per-user and operation-based, which is a rewrite of `history.ts`, not a
   patch.
3. Presence: live cursors with names, remote selection highlights, follow a
   user.
4. Sharing: links with view, comment and edit roles; board-level and
   workspace-level permissions.
5. Comments: threads anchored to objects or positions, resolve, mentions.

## Phase 3: editing quality

Closes the remaining gap that makes the editor feel unfinished. Items marked
done shipped in phase 1b.

1. Floating property toolbar: colours, stroke, font, alignment, sticky colour,
   connector style. (done)
2. Connector routing: elbow and curved paths, snap to anchor points (done);
   labels, arrowhead options, connector-to-connector bends, obstacle avoidance.
3. Snapping and smart guides, align and distribute commands, grid snap toggle
   (done for moves); resize snapping and equal-spacing guides.
4. Sticky notes that auto-fit their text, tags on stickies, voting dots.
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
   PDF.
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

Realistic sequencing for one small team: phase 2 is two to three months,
phase 3 another two to three, and phase 4 is open-ended.
