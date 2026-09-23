import { downloadBlob } from './download';
import type { Editor } from './Editor';
import type { IconName } from '../ui';
import { toast } from '../ui';
import { READ_ONLY_TOOLS, TOOLS, TOOL_META } from './tools';

export type CommandGroup = 'tool' | 'edit' | 'arrange' | 'view' | 'board';

export const GROUP_LABELS: Record<CommandGroup, string> = {
  tool: 'Tools',
  edit: 'Edit',
  arrange: 'Arrange',
  view: 'View',
  board: 'Board',
};

export interface Command {
  id: string;
  label: string;
  icon: IconName;
  group: CommandGroup;
  /**
   * Default chords, in the form `chordFor` produces. The first is the one
   * shown in tooltips and lists; the rest are aliases people already expect
   * (Ctrl+Y for redo, `Ctrl+]` for bring to front).
   */
  shortcut?: string[];
  run(editor: Editor): void;
  isEnabled?(editor: Editor): boolean;
  isActive?(editor: Editor): boolean;
  /**
   * Changes the board, so a view-only visitor cannot run it. This replaces the
   * hand-maintained list of keys read-only mode used to allow.
   */
  writes?: boolean;
  /**
   * False for commands that only make sense from the keyboard. Nudging by a
   * pixel and cancelling the current gesture are real commands — they are
   * remappable and they are dispatched like everything else — but picking them
   * out of a list would be absurd.
   */
  inPalette?: boolean;
}

const tools: Command[] = TOOLS.map((tool) => ({
  id: `tool-${tool}`,
  label: `${TOOL_META[tool].label} tool`,
  icon: TOOL_META[tool].icon,
  group: 'tool',
  shortcut: [TOOL_META[tool].key.toUpperCase()],
  run: (e) => e.setTool(tool),
  isActive: (e) => e.tool === tool,
  writes: !READ_ONLY_TOOLS.includes(tool),
}));

const nudges: Command[] = (
  [
    ['left', 'Left', -1, 0, 'ArrowLeft'],
    ['right', 'Right', 1, 0, 'ArrowRight'],
    ['up', 'Up', 0, -1, 'ArrowUp'],
    ['down', 'Down', 0, 1, 'ArrowDown'],
  ] as const
).flatMap(([id, label, dx, dy, key]) => [
  {
    id: `nudge-${id}`,
    label: `Nudge ${label.toLowerCase()}`,
    icon: 'select' as IconName,
    group: 'edit' as const,
    shortcut: [key],
    run: (e: Editor) => e.nudge(dx, dy),
    isEnabled: (e: Editor) => e.selection.length > 0,
    writes: true,
    inPalette: false,
  },
  {
    id: `nudge-${id}-far`,
    label: `Nudge ${label.toLowerCase()} further`,
    icon: 'select' as IconName,
    group: 'edit' as const,
    shortcut: [`Shift+${key}`],
    run: (e: Editor) => e.nudge(dx * 10, dy * 10),
    isEnabled: (e: Editor) => e.selection.length > 0,
    writes: true,
    inPalette: false,
  },
]);

const hasSelection = (e: Editor) => e.selection.length > 0;

/**
 * Every action the editor offers, defined once. The rail, the zoom cluster,
 * the arrange menu, the keyboard, the palette and the context menu all read
 * from here, so a button and its shortcut cannot come apart and an action
 * cannot be enabled in one surface and dead in another.
 *
 * **What is deliberately not here: the pointer-down switch.** The roadmap said
 * the registry would absorb it. It should not. Those branches have no label,
 * no icon, no shortcut and no menu; they take a world point, the hit-test
 * result and the modifier state, and they start a drag rather than performing
 * an action. Giving them a `run(editor)` signature nothing calls would be a
 * table for the sake of having one. The per-tool drag behaviour belongs in a
 * tool-behaviour table of its own, which is a separate job from this one.
 */
export const COMMANDS: Command[] = [
  ...tools,

  { id: 'undo', label: 'Undo', icon: 'undo', group: 'edit', shortcut: ['Ctrl+Z'], run: (e) => e.undo(), isEnabled: (e) => e.canUndo, writes: true },
  { id: 'redo', label: 'Redo', icon: 'redo', group: 'edit', shortcut: ['Ctrl+Shift+Z', 'Ctrl+Y'], run: (e) => e.redo(), isEnabled: (e) => e.canRedo, writes: true },
  { id: 'cut', label: 'Cut', icon: 'cut', group: 'edit', shortcut: ['Ctrl+X'], run: (e) => e.cut(), isEnabled: hasSelection, writes: true },
  // Copying does not change the board, so a view-only visitor may do it. They
  // can already export the board as a PNG; refusing the clipboard would be
  // theatre rather than a restriction.
  { id: 'copy', label: 'Copy', icon: 'copy', group: 'edit', shortcut: ['Ctrl+C'], run: (e) => e.copy(), isEnabled: hasSelection },
  { id: 'paste', label: 'Paste', icon: 'paste', group: 'edit', shortcut: ['Ctrl+V'], run: (e) => e.paste(), isEnabled: (e) => e.clipboard !== null, writes: true },
  { id: 'duplicate', label: 'Duplicate', icon: 'duplicate', group: 'edit', shortcut: ['Ctrl+D'], run: (e) => e.duplicate(), isEnabled: hasSelection, writes: true },
  { id: 'select-all', label: 'Select all', icon: 'selectAll', group: 'edit', shortcut: ['Ctrl+A'], run: (e) => e.selectAll(), isEnabled: (e) => e.selectables().length > 0 },
  { id: 'delete', label: 'Delete', icon: 'trash', group: 'edit', shortcut: ['Delete', 'Backspace'], run: (e) => e.deleteSelection(), isEnabled: hasSelection, writes: true },
  ...nudges,
  {
    id: 'cancel',
    label: 'Cancel',
    icon: 'close',
    group: 'edit',
    shortcut: ['Escape'],
    run: (e) => e.cancel(),
    inPalette: false,
  },

  { id: 'group', label: 'Group', icon: 'group', group: 'arrange', shortcut: ['Ctrl+G'], run: (e) => e.groupSelection(), isEnabled: (e) => e.selection.length >= 2, writes: true },
  {
    id: 'ungroup',
    label: 'Ungroup',
    icon: 'ungroup',
    group: 'arrange',
    shortcut: ['Ctrl+Shift+G'],
    run: (e) => e.ungroupSelection(),
    isEnabled: (e) => e.selection.some((id) => e.scene.get(id)?.type === 'group'),
    writes: true,
  },
  { id: 'bring-forward', label: 'Bring forward', icon: 'forward', group: 'arrange', shortcut: [']'], run: (e) => e.bringForward(), isEnabled: hasSelection, writes: true },
  { id: 'send-backward', label: 'Send backward', icon: 'backward', group: 'arrange', shortcut: ['['], run: (e) => e.sendBackward(), isEnabled: hasSelection, writes: true },
  { id: 'bring-to-front', label: 'Bring to front', icon: 'front', group: 'arrange', shortcut: ['}', 'Ctrl+]'], run: (e) => e.bringToFront(), isEnabled: hasSelection, writes: true },
  { id: 'send-to-back', label: 'Send to back', icon: 'back', group: 'arrange', shortcut: ['{', 'Ctrl+['], run: (e) => e.sendToBack(), isEnabled: hasSelection, writes: true },

  { id: 'zoom-in', label: 'Zoom in', icon: 'zoomIn', group: 'view', shortcut: ['=', '+', 'Ctrl+=', 'Ctrl++'], run: (e) => e.zoomBy(1.25) },
  { id: 'zoom-out', label: 'Zoom out', icon: 'zoomOut', group: 'view', shortcut: ['-', 'Ctrl+-'], run: (e) => e.zoomBy(0.8) },
  { id: 'zoom-fit', label: 'Zoom to fit', icon: 'fit', group: 'view', shortcut: ['!', 'Ctrl+1'], run: (e) => e.zoomToFit() },
  {
    id: 'zoom-selection',
    label: 'Zoom to selection',
    icon: 'fit',
    group: 'view',
    shortcut: ['@'],
    run: (e) => e.zoomToSelection(),
    isEnabled: hasSelection,
  },
  { id: 'zoom-reset', label: 'Zoom to 100%', icon: 'reset', group: 'view', shortcut: ['Ctrl+0'], run: (e) => e.resetCamera() },
  { id: 'toggle-minimap', label: 'Minimap', icon: 'minimap', group: 'view', run: (e) => e.setMinimapOpen(!e.minimapOpen), isActive: (e) => e.minimapOpen },
  { id: 'toggle-grid', label: 'Snap to grid', icon: 'grid', group: 'view', shortcut: ['G'], run: (e) => e.setGridSnap(!e.gridSnap), isActive: (e) => e.gridSnap },

  { id: 'palette', label: 'Command palette', icon: 'command', group: 'board', shortcut: ['Ctrl+K'], run: (e) => e.setPaletteOpen(!e.paletteOpen) },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard', group: 'board', run: (e) => e.setOpenPanel(e.openPanel === 'shortcuts' ? null : 'shortcuts') },
  { id: 'export-png', label: 'Export as PNG', icon: 'image', group: 'board', run: exportPNG },
  { id: 'save-json', label: 'Save board', icon: 'save', group: 'board', shortcut: ['Ctrl+S'], run: saveJSON },
];

function exportPNG(editor: Editor): void {
  editor.exportPNGCanvas(2).toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, 'board.png');
      toast('Exported board.png', 'success');
    } else {
      toast('Could not export this board as a PNG', 'error');
    }
  }, 'image/png');
}

function saveJSON(editor: Editor): void {
  const json = JSON.stringify(editor.toBoardFile(), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), 'board.json');
  toast('Saved board.json', 'success');
}

export const COMMANDS_BY_ID: Record<string, Command> = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

export function command(id: string): Command {
  const found = COMMANDS_BY_ID[id];
  if (!found) throw new Error(`No such command: ${id}`);
  return found;
}

/** Every command in a group, in declaration order. */
export function commandsIn(group: CommandGroup): Command[] {
  return COMMANDS.filter((c) => c.group === group);
}

/** Whether the command can run right now, read-only included. */
export function isEnabled(cmd: Command, editor: Editor): boolean {
  if (cmd.writes && editor.readOnly) return false;
  return cmd.isEnabled ? cmd.isEnabled(editor) : true;
}

export function isActive(cmd: Command, editor: Editor): boolean {
  return cmd.isActive ? cmd.isActive(editor) : false;
}
