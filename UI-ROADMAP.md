# UI roadmap

The editor works. It does not look like a product. This document says why,
and sequences the fix so that the extension points land before the visual
work, not after.

The ordering principle: every phase here is a foundation the next one stands
on. Doing the visual polish first means doing it twice.

## Why it looks the way it does

Judged against a mature whiteboard, the gap is not taste, it is structure.

- **Everything is a text button in one strip.** Twenty-eight controls across
  two rows at the top, all the same weight, all visible at all times. Tools,
  history, z-order, zoom, file actions and comments compete as equals. A
  mature editor puts creation tools on a left rail, board identity and
  presence in a slim top bar, and everything else in context. *(Fixed in
  UI-1: rail, top bar, zoom cluster, dock and a context menu on the property
  bar.)*
- **No icons.** Text labels in boxes read as a debug harness. *(Fixed in
  UI-0: tools and actions are icon buttons with tooltips.)*
- **No depth.** One border colour, one radius, no elevation, no motion. The
  floating property bar, the comments panel and the toolbar are visually the
  same object. *(Elevation fixed in UI-0, motion in UI-4.)*
- **The canvas chrome is functional, not designed.** Selection handles,
  guides, comment pins and peer cursors each pick their own colour inline.
  *(Colours fixed in UI-0, the drawing itself in UI-3.)*
- **No theme.** Sixty hardcoded hex values in `src/app.css`, twenty-four more
  in `src/render/renderer.ts`. Dark mode is currently impossible without a
  find-and-replace across two languages. *(Fixed in UI-0: both are zero. Dark
  mode itself landed in UI-5, as one more token block.)*

## Why it is hard to extend today

This is the part that matters more than the look.

- **Adding a shape property touches five places**: the type, the serialiser,
  `StylePatch`, the `setStyle` switch, and hand-written JSX in
  `PropertyBar.tsx` with its own value-extraction line. That file is 230
  lines of conditionals and grows with every property. *(Fixed in UI-2:
  `StylePatch` is derived and `setStyle` is a loop, so it is the type, the
  serialiser and one descriptor.)*
- **Adding a tool touches five places**: the `Tool` union, `TOOLS`, the
  `TOOL_META` map, the pointer-down switch, and the keyboard map. *(UI-1 took
  this to three: the `Tool` union, one `TOOL_META` entry and one `RAIL_GROUPS`
  entry, all in `src/editor/tools.ts`. `TOOLS` and the keyboard map are
  derived from the table, so a shortcut cannot drift from the one its tooltip
  advertises. The pointer-down switch is behaviour: UI-6 looked at it and left
  it where it is, for the reason recorded there.)*
- **"A button" is defined four times in CSS** (`.toolbar button`,
  `.property-bar button`, `.thread-head button`, `.composer-actions button`),
  each with its own padding, border and radius. *(Fixed in UI-0: one
  `.ui-button`, variants by prop.)*
- **Panels have nowhere to go.** `CommentsPanel` is absolutely positioned at
  the top right with a fixed width. A layers panel or a template library
  would fight it for the same pixels. *(Fixed in UI-1: `registerPanel` and a
  dock that renders whatever is registered.)*
- **Buttons and shortcuts are wired separately**, so every action is
  implemented twice and can drift. *(Fixed in UI-6: one command registry that
  the buttons, menus, keyboard, palette and context menu all read.)*

## Phase UI-0: foundations — done

No new features. The point is that everything after this is cheap.

1. **Design tokens.** [x] `src/ui/tokens.css` holds one `:root` block:
   surfaces, borders, text, accent and status colours, the canvas group,
   radius, elevation, spacing, type scale, control heights and motion. No
   other stylesheet writes a colour.
   *Proved by* `src/ui/__tests__/tokens.test.ts` — no colour literal outside
   `tokens.css`, and every `var(--x)` the stylesheets use is declared.
2. **Canvas theme object.** [x] `src/render/theme.ts` resolves the `--canvas-*`
   group into a plain object, which `renderBoard` and `drawShape` take as an
   argument. The renderer has no colour of its own left.
   *Proved by* `src/render/__tests__/theme.test.ts` (the fallback matches the
   stylesheet; `renderer.ts` holds no colour literal) and
   `e2e/theme.spec.ts` — changing `--canvas-bg` and `--accent` at runtime and
   calling `refreshTheme()` repaints the canvas and the DOM together.
3. **Component primitives.** [x] `Button`, `IconButton`, `Select`, `Swatch`,
   `Panel`, `Tooltip`, `Divider` in `src/ui/`. One definition each, variants
   by prop. The four CSS button blocks are gone.
   *Proved by* `src/ui/__tests__/tokens.test.ts` — no stylesheet but
   `primitives.css` targets the `button` element.
4. **Icon set.** [x] `src/ui/Icon.tsx`, one component over 38 inline SVG
   glyphs, covering every tool, editing action and alignment.
   *Proved by* `e2e/theme.spec.ts` — every tool and action control in the
   toolbar contains an icon — and `e2e/accessibility.spec.ts`, which still
   finds an accessible name on every control now that the labels are gone.

**Extension point delivered:** changing the entire look is editing one token
block; adding a control uses an existing primitive. Toolbar actions are now
one entry in an `ACTIONS` table rather than a block of hand-written JSX.

## Phase UI-1: the shell — done

Replace the one strip with a layout that has somewhere to put things. The
canvas now fills the workspace and the chrome floats over it, so nothing is
reserved for a bar that may be empty.

1. **Left tool rail.** [x] Icon buttons in four groups, from `RAIL_GROUPS` in
   `src/editor/tools.ts`, with tooltips carrying the shortcut.
   *Proved by* `src/editor/__tests__/tools.test.ts` (every tool is in exactly
   one group, every shortcut is unique and maps back, every icon exists) and
   `e2e/shell.spec.ts`, which checks the rail renders that grouping.
   **Not built: overflow flyouts.** No group overflows yet, and a flyout with
   nothing to hold is code without a caller. The group model is where one
   hangs when phase 4 adds tables and kanban.
2. **Slim top bar.** [x] Title, sync status, view-only badge, presence,
   name and share. The file actions (export, save, load) sit in a board menu
   behind a `⋯` button rather than on the bar.
   *Proved by* `e2e/shell.spec.ts` — no tool and no view control is in the top
   bar, and every view control is in the zoom cluster.
3. **Bottom-left zoom cluster.** [x] Undo, redo, zoom out, level, zoom in,
   fit, grid toggle.
4. **Right dock with a slot registry.** [x] `registerPanel({ id, slot, icon,
   title, badge, headerExtra, render })` in `src/editor/panels.tsx`; the dock
   renders a tab per registered panel and the open one beside it. Comments is
   one registration in `registerPanels.tsx`. `Editor.commentsOpen` is now
   derived from `Editor.openPanel`, so nothing in the editor is comments-shaped.
   *Proved by* `src/editor/__tests__/panels.test.ts` (register, replace, badge)
   and `e2e/shell.spec.ts`, which checks the dock's tab count, its accessible
   name, its header and its body all come from the definition.
5. **Undo and redo** [x] moved to the zoom cluster.

Z-order, grouping and delete had no home once the strip went. They are
selection actions, so they went with the selection: an **arrange menu** on the
property bar, behind a `⋯` button so the bar does not grow by 220px. The bar
also **measures itself** now and stays clear of the rail and the dock, which
report their own footprint through `Editor.setInset`. The old code guessed a
fixed 520px width and let the bar run off the right edge.

**Extension point delivered:** a new panel is one `registerPanel` call; a new
tool is one `TOOL_META` entry and one `RAIL_GROUPS` entry.

## Phase UI-2: schema-driven property panel — done

The single highest-leverage change for extensibility.

1. **Field descriptors.** [x] `src/editor/fields.ts` declares every editable
   property once: its kind, the shape types that have it, how to read it off a
   shape and what patch writing it produces. `StylePatch` is a mapped type
   over that table, so the patch `setStyle` accepts and the fields the bar can
   edit cannot drift apart.
2. **Generic renderer.** [x] The property bar renders whichever fields the
   selection brings, in the order they are declared, with one branch per kind
   of control rather than one per property. `Editor.setStyle` reads the same
   table: its 41-line switch is a 15-line loop.
3. **Indeterminate multi-select.** [x] A field whose shapes disagree reads as
   mixed: no swatch pressed, `Mixed` in the dropdown, `data-mixed` on the
   control. It used to show the first shape's value, which the control then
   wrote back on the next click, quietly changing shapes that were already
   right.

**A union, not an intersection.** This document previously said the bar should
render the intersection of the selected shapes' schemas. That is wrong: a
rectangle and a line share no fill, and hiding stroke because one of them has
no fill would be worse than what came before. The bar renders the union and
applies each field to the shapes that have it, which is also what it did
before, and is what the indeterminate state exists to make honest.

**Extension point delivered:** the property bar no longer mentions a single
shape property.

| Lines in `PropertyBar.tsx` naming a shape property | Before | After |
| --- | --- | --- |
| | 83 | 0 |

Adding a property is the shape type, the serialiser, one descriptor, and a
default wherever the shape is created. The patch type, `setStyle` and the
whole UI follow from the descriptor.

*Proved by* `src/editor/__tests__/fields.test.ts` — every field reads and
writes back on every shape type it claims (a half-declared field fails there
rather than in the UI), a patch touches only the shapes that have its
properties, a connector end is rewritten rather than replaced, and a
disagreeing selection reports mixed — and by `e2e/properties.spec.ts`, which
checks the mixed swatches and the `Mixed` dropdown in the browser and that
picking a value settles the whole selection.

## Phase UI-3: canvas chrome — done

Now that the renderer takes a theme, make the canvas look deliberate.

1. **Selection.** [x] Frame down from 1.5px to 1px, handles from an 8px square
   to a 7px rounded one, and the grab radius split out as `HANDLE_HIT_RADIUS`
   so shrinking what is drawn does not shrink what can be hit. The hover
   outline is now held 3px off the shape's own edge, so "a click would take
   this" no longer looks like the selection frame, which sits on the bounds.
   *Not done as written:* handles do not "scale with zoom". They are drawn in
   screen space and always were, which is correct — a handle that grew with
   zoom would swallow the shape. The real problem was that they were too big
   at any zoom.
   *Proved by* `e2e/chrome.spec.ts`, which grabs a handle from 6px outside the
   drawn square and resizes, and checks that 12px out marquees instead — so
   the radius is pinned from both sides rather than just made generous.
2. **Guides and spacing markers.** [x] Already themed since UI-0; the
   measurement labels now sit on a chip so they stay readable over whatever
   they cross.
3. **Cursors.** [x] `src/editor/cursors.ts` draws one per tool: a crosshair
   with the tool's mark, stroked twice so it has a halo and reads over any
   background, with both colours taken from the canvas theme so it follows a
   theme change instead of disappearing into it. Select and hand keep the
   browser's arrow and grab hand, which people already read correctly.
   *Proved by* `src/editor/__tests__/cursors.test.ts` (every drawing tool has
   its own, the hotspot is the crosshair rather than the image corner, both
   colours come from the theme, the payload is URL-encoded so the data URL
   survives the characters SVG needs) and `e2e/chrome.spec.ts`, which reads
   the computed cursor off the board for every tool.
4. **Comment pins and peer cursors.** [x] Both now cast the shadow the DOM
   chrome does, from a `--canvas-shadow` token, and the peer name chip uses
   the same corner radius as the panels.
5. **Grid.** [x] `src/render/grid.ts` replaces the fixed-step grid. Two nested
   levels are drawn: a coarse one at full strength and the level four times
   finer fading in as it becomes legible. Because every coarse dot is also a
   fine dot, nothing pops when the levels shift.
   *Proved by* `src/render/__tests__/grid.test.ts`, which walks the zoom range
   and measures the largest change in any dot's darkness between adjacent
   steps: **1.0 for the old fixed-step grid, 0.06 for this one** — and that
   0.06 is the point where the fine level is dropped rather than drawn at an
   invisible opacity across a few thousand dots. The old grid is in the test
   as a guard, so the bound cannot quietly stop meaning anything.

## Phase UI-4: motion and feedback — done

1. **Panels arrive rather than appear.** [x] The dock slides in from the
   right, the board menu, share popover and arrange menu rise, the property
   bar fades. All on `--duration-base`/`--duration-fast` and the one easing
   token, and all off under `prefers-reduced-motion`.
   The property bar fades without moving on purpose: it is positioned from the
   selection and measured, so it must never be anywhere but where it says.
2. **Transitions on tool changes, selection and hover.** [x] *for the DOM*,
   since UI-0: buttons transition background, border and colour. **Not done
   for the canvas**, and not worth doing. Selection and hover are drawn, not
   styled, so a transition means a render loop running for the length of every
   fade — a per-frame cost, against a 16ms budget, for an effect nobody asked
   for. The canvas already responds within one frame.
3. **Toasts replacing `window.alert`.** [x] `src/ui/toast.ts` and `Toaster`.
   Save, export and load all report, and a failed load no longer blocks the
   tab on a native dialog that could not be styled and had nowhere to put the
   successful cases beside it. Errors stay up longer than confirmations.
4. **Empty state.** [x] An empty board names the first action and the key that
   takes it. It is `pointer-events: none` throughout rather than offering a
   button, because a button there would sit exactly where the first drag
   starts and would swallow it.

*Proved by* `src/ui/__tests__/toast.test.ts` (order, subscriber notifications
only on real changes, a stable snapshot so `useSyncExternalStore` cannot loop,
auto-dismissal on injected timers, errors outlasting confirmations) and
`e2e/feedback.spec.ts` — the hint appears, a rectangle can be drawn straight
through the middle of it, and it goes when the board is no longer empty; a
save raises a toast that leaves on its own and can also be dismissed by hand;
and the dock's animation is `ui-slide-from-right` normally and `none` under
reduced motion. `e2e/save-load.spec.ts` now asserts the malformed-file message
arrives as an error toast **and that no dialog is raised at all**.

## Phase UI-5: theme, density, accessibility — done

1. **Dark mode.** [x] `tokens.css` grew a second and third block: dark for the
   people who choose it, and a byte-identical dark for the people whose system
   is dark and who have chosen nothing. The DOM and the canvas change together,
   because `Editor.refreshTheme()` re-resolves the `--canvas-*` group whenever
   the choice or the system preference changes.
   *Not a single block:* CSS cannot share one declaration block between
   `[data-theme='dark']` and `@media (prefers-color-scheme: dark)`. The two are
   written twice and `contrast.test.ts` asserts they are identical, rather than
   leaving it to whoever edits one of them next.
   **`system` sets no attribute at all**, so the media query applies; `light`
   has to be explicit, because it is the only way to beat a dark system.
   **One colour does not follow the theme:** sticky and shape text. A note's
   fill is a pale colour the person picked, in either theme, so its text is
   `--canvas-shape-text`, dark in both. Flipping it with the theme would have
   put light grey on pale yellow.
2. **Density toggle.** [x] `comfortable` and `compact` in the board menu.
   Compact redeclares five spacing steps, both control heights and two type
   sizes, and **no colour**: a density that also changed colours would be a
   second theme with a misleading name.
3. **Contrast audit.** [x] `src/ui/__tests__/contrast.test.ts` parses the token
   blocks and computes the WCAG ratio for every foreground/background pair the
   UI actually draws, in both themes: 4.5:1 for text, 3:1 for borders and
   controls. It found two real failures, both now fixed — `--border-strong` was
   `#9aa0a6` on white (**2.64:1**), and dark `--accent` was `#5b8def` under
   white text (**3.23:1**). The test also asserts the dark blocks are identical
   and that dark overrides every colour light declares, so a token added to one
   theme cannot silently keep the other theme's value.
   Focus rings and `prefers-reduced-motion` already shipped in UI-0 and UI-4.

*Proved by* `src/ui/__tests__/appearance.test.ts` (the attribute for each
choice, `system` removing it, a bad stored value falling back rather than
throwing, persistence, subscribers notified only on a real change, a stable
snapshot so `useSyncExternalStore` cannot loop, and storage or `document`
missing entirely), `src/ui/__tests__/contrast.test.ts` above, and
`e2e/theme.spec.ts` — dark repaints the DOM and the canvas together, the
choice survives a reload, the system decides when nothing is chosen, choosing
light overrides a dark system, and compact shrinks a control **without
changing its colour**.

## Phase UI-6: command layer — done

1. **Command registry.** [x] `src/editor/commands.ts` declares every action
   once: `{ id, label, icon, group, shortcut, run, isEnabled, isActive,
   writes, inPalette }`. The zoom cluster, the arrange menu, the board menu,
   the keyboard, the palette and the context menu are all lists of ids now.
   `ZoomCluster.tsx` is a layout and nothing else — it knows the order of the
   buttons and where the dividers go, not what any of them do.
   `Editor.onKeyDown` is one line.

   | Lines naming a specific action | Before | After |
   | --- | --- | --- |
   | `Editor.onKeyDown` | 111 | 1 |
   | `ZoomCluster.tsx` | 21 | 0 |
   | `PropertyBar.tsx` arrange table | 9 | 1 |

   **`writes` replaced the read-only key list.** `Board.tsx` used to carry two
   hand-maintained arrays of keys a view-only visitor was allowed to press.
   They are gone: a command declares whether it changes the board and the
   registry refuses it. One behaviour changed as a result, deliberately —
   copying is allowed on a view-only board, because it does not change
   anything and the same person can already export the board as a PNG.
   Pasting and cutting are still refused.

   **Not done as written: the pointer-down switch is still a switch.** The
   roadmap said the registry would absorb it. It should not. Those branches
   have no label, no icon, no shortcut and no menu; they take a world point,
   the hit-test result and the modifier state, and they *start a drag* rather
   than perform an action. Giving them a `run(editor)` signature nothing calls
   would be a table for the sake of having one. Per-tool drag behaviour wants
   a tool-behaviour table of its own, which is a different job.
2. **Command palette** [x] on Ctrl+K, filtering on the command's name and its
   group. A command that cannot run right now is listed and greyed rather than
   hidden: "Group is there but greyed" answers a question that "Group is
   missing" does not. Arrow keys move over the runnable rows only, so the
   highlight can never sit on a dead one.
3. **Context menu** [x] on right-click: one list of ids for a selection and one
   for bare canvas. Right-clicking a shape selects it first, so the menu cannot
   offer to delete something the person is not pointing at, and the menu flips
   back inside the board rather than running off the bottom-right corner.
4. **User-remappable shortcuts.** [x] `src/editor/shortcuts.ts` holds a store
   of overrides and a `Shortcuts` panel registered into the dock — one
   `registerPanel` call, which is what UI-1 built that seam for. Press a
   command's key button, then the keys you want. Only the differences from the
   defaults are stored, so a default that changes later still reaches people
   who never remapped it.
   **A chord runs one command.** Rebinding takes the key off whoever held it
   and says so in a toast, rather than leaving a second owner that silently
   never fires.

   Chords have one spelling, which is what makes the table checkable:
   modifiers in a fixed order, single characters upper-cased, and **Shift named
   only for a letter or a named key**. `Shift+]` reports `}`, so spelling it
   `Shift+}` would give one key press two names and whichever a command
   declared, the other would never fire. A unit test presses every chord in the
   registry and fails if the key press does not produce it, so a shortcut that
   could never fire cannot be declared.

*Proved by* `src/editor/__tests__/commands.test.ts` (unique ids, an icon that
exists, no chord claimed twice, every declared chord reachable from a real key
press, every tool present with the key the rail advertises, `isEnabled`
answering on a fresh board, and read-only disabling exactly the writing
commands and no others — plus dispatch: Ctrl+G, G and Ctrl+Shift+G telling
themselves apart, nudge by one and by ten, an unbound key left for the browser,
and a remap taking effect), `src/editor/__tests__/shortcuts.test.ts` (the chord
spelling rules, defaults, rebinding, taking a chord from its previous owner,
storing only the differences, reading a remap back, falling back on a stored
value it cannot use, ignoring an override for a command that no longer exists,
resetting, notifying only on a real change with a stable snapshot, and storage
that throws), and `e2e/commands.spec.ts` — Ctrl+K opens, filters and runs; the
arrow keys move the highlight; a command that cannot run is listed disabled;
right-click selects the shape under the pointer and deletes it; the canvas menu
offers different commands and closes on Escape; the menu stays inside the board
in the bottom-right corner; and a rebind reaches the keyboard, the menus and
the palette at once, survives a reload and resets.

## What not to do

- **Do not adopt a component library** (MUI, Chakra, shadcn). This is a
  canvas app with roughly twenty bespoke controls. A library adds a bundle
  and a set of opinions to fight, and none of its components are the ones
  that matter here.
- **Do not start with dark mode.** Without UI-0 it is a second set of
  hardcoded values.
- **Do not polish the property bar before UI-2.** That work would be thrown
  away. *(UI-2 is done, so polishing it is now fair game: it is wide, and
  collapsing the fill and stroke palettes behind a popover is the obvious
  next move.)*
- **Do not add a CSS framework.** The token layer plus primitives is smaller
  than configuring one.

## Sequencing

UI-0 and UI-1 are the ones that change the impression, and UI-2 is the one
that changes the cost of everything after. **UI-0 through UI-6 are done.**
What is left is the phase 3 feature work still outstanding in
[SPEC.md](SPEC.md) — rich text, minimap, image upload, sticky tags — which now
has a shell, a set of primitives, a property schema, a themed canvas, a command
registry and somewhere to report failures to land in rather than add to.

Adding a feature now costs: the shape type and its serialiser, one field
descriptor, one `TOOL_META` and `RAIL_GROUPS` entry if it needs a tool, one
`registerPanel` call if it needs a panel, and one `COMMANDS` entry per action
it offers. None of those touch the layout, the keyboard, the palette or the
theme.

The phase 3 feature work in [SPEC.md](SPEC.md) (rich text, minimap, image
upload) should land after UI-1, so each new surface uses the shell and the
primitives rather than adding to the strip.
