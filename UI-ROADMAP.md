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
  presence in a slim top bar, and everything else in context.
- **No icons.** Text labels in boxes read as a debug harness.
- **No depth.** One border colour, one radius, no elevation, no motion. The
  floating property bar, the comments panel and the toolbar are visually the
  same object.
- **The canvas chrome is functional, not designed.** Selection handles,
  guides, comment pins and peer cursors each pick their own colour inline.
- **No theme.** Sixty hardcoded hex values in `src/app.css`, twenty-four more
  in `src/render/renderer.ts`. Dark mode is currently impossible without a
  find-and-replace across two languages.

## Why it is hard to extend today

This is the part that matters more than the look.

- **Adding a shape property touches five places**: the type, the serialiser,
  `StylePatch`, the `setStyle` switch, and hand-written JSX in
  `PropertyBar.tsx` with its own value-extraction line. That file is 230
  lines of conditionals and grows with every property.
- **Adding a tool touches five places**: the `Tool` union, `TOOLS`, the
  `TOOL_LABELS` map, the pointer-down switch, and the keyboard map.
- **"A button" is defined four times in CSS** (`.toolbar button`,
  `.property-bar button`, `.thread-head button`, `.composer-actions button`),
  each with its own padding, border and radius.
- **Panels have nowhere to go.** `CommentsPanel` is absolutely positioned at
  the top right with a fixed width. A layers panel or a template library
  would fight it for the same pixels.
- **Buttons and shortcuts are wired separately**, so every action is
  implemented twice and can drift.

## Phase UI-0: foundations

No new features. The point is that everything after this is cheap.

1. **Design tokens.** One `:root` block: surface, surface-raised, border,
   text, text-muted, accent, danger, radius, shadow, space, font, duration.
   Every rule in `app.css` refers to tokens only.
2. **Canvas theme object.** The canvas cannot read CSS variables. Add
   `src/render/theme.ts` that resolves the tokens once into a plain object
   and pass it into `renderBoard`. Both surfaces then change colour together,
   which is what makes dark mode a one-line switch later.
3. **Component primitives.** `Button`, `IconButton`, `Select`, `Swatch`,
   `Panel`, `Tooltip`, `Divider` in `src/ui/`. One definition each, variants
   by prop. Delete the four CSS button blocks.
4. **Icon set.** Inline SVG sprite, one component, `<Icon name="sticky" />`.
   Twenty-odd icons for existing tools and actions.

**Extension point delivered:** changing the entire look is editing one token
block; adding a control uses an existing primitive.

## Phase UI-1: the shell

Replace the one strip with a layout that has somewhere to put things.

1. **Left tool rail.** Icon buttons, grouped (select and hand; shapes; sticky,
   text and pen; connector, frame and comment), tooltips with shortcut hints.
   Overflow groups into flyouts, which is how the rail keeps working when
   phase 4 adds tables and kanban.
2. **Slim top bar.** Board title, sync status, presence avatars, share. Only
   identity and collaboration, nothing else.
3. **Bottom-left zoom cluster.** Zoom out, level, in, fit, grid toggle.
4. **Right dock with a slot registry.** `registerPanel({ id, slot, icon,
   title, render })`. Comments becomes the first registered panel instead of
   a special case; layers, templates and a shape library dock later without
   touching the layout.
5. **Undo and redo** move next to the zoom cluster or into the command
   palette, out of the primary bar.

**Extension point delivered:** a new panel is one `registerPanel` call; a new
tool group is one rail entry.

## Phase UI-2: schema-driven property panel

The single highest-leverage change for extensibility.

1. **Field descriptors.** A shape type declares its editable fields as data:
   `{ kind: 'color', key: 'fill', label: 'Fill', palette: 'sticky' }`,
   `{ kind: 'enum', key: 'style', options: CONNECTOR_STYLES }`,
   `{ kind: 'number', key: 'strokeWidth', options: [1, 2, 4, 8] }`,
   `{ kind: 'action', id: 'vote' }`.
2. **Generic renderer.** The property bar renders the intersection of the
   selected shapes' schemas. The 230 lines of conditionals go away.
3. **Consistent multi-select semantics** fall out of one code path: mixed
   values show as indeterminate rather than silently showing the first
   shape's value, which is the current behaviour and is wrong.

**Extension point delivered:** adding a property becomes the type, the
serialiser and one descriptor. Three places instead of five, and the UI is
free.

## Phase UI-3: canvas chrome

Now that the renderer takes a theme, make the canvas look deliberate.

1. **Selection**: thinner frame, smaller handles that scale with zoom, a
   hover state distinct from selection.
2. **Guides and spacing markers**: read from theme, consistent weight.
3. **Cursors**: proper SVG cursors per tool rather than browser defaults.
4. **Comment pins and peer cursors**: consistent shape language with the DOM
   chrome.
5. **Grid**: subtler dots, fading out as zoom drops rather than snapping
   between densities.

## Phase UI-4: motion and feedback

1. Panels slide rather than appear. 150ms, one easing token.
2. Tool changes, selection and hover get transitions.
3. Toasts for save, export and load failures, replacing `window.alert`.
4. Empty states: the board with nothing on it should suggest the first action.

## Phase UI-5: theme, density, accessibility

1. **Dark mode.** One token block, both surfaces, because of UI-0.2.
2. **Density toggle** for smaller screens.
3. **Focus rings** on the new primitives, contrast audit against the tokens,
   reduced-motion honoured.

## Phase UI-6: command layer

1. **Command registry**: `{ id, label, icon, shortcut, group, run, isEnabled,
   isActive }`. Buttons, menus, shortcuts and the palette all read from it,
   so an action is defined once.
2. **Command palette** on Ctrl+K.
3. **Context menu** on right-click, from the same registry.
4. **User-remappable shortcuts**, which the registry makes almost free.

## What not to do

- **Do not adopt a component library** (MUI, Chakra, shadcn). This is a
  canvas app with roughly twenty bespoke controls. A library adds a bundle
  and a set of opinions to fight, and none of its components are the ones
  that matter here.
- **Do not start with dark mode.** Without UI-0 it is a second set of
  hardcoded values.
- **Do not polish the property bar before UI-2.** That work would be thrown
  away.
- **Do not add a CSS framework.** The token layer plus primitives is smaller
  than configuring one.

## Sequencing

UI-0 and UI-1 are the ones that change the impression, and UI-2 is the one
that changes the cost of everything after. UI-0 through UI-2 are worth doing
as a block; UI-3 onwards can be interleaved with feature work.

The phase 3 feature work in [SPEC.md](SPEC.md) (rich text, minimap, image
upload) should land after UI-1, so each new surface uses the shell and the
primitives rather than adding to the strip.
