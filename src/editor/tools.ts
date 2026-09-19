import type { IconName } from '../ui';

export type Tool = 'select' | 'hand' | 'rect' | 'ellipse' | 'line' | 'sticky' | 'text' | 'pen' | 'connector' | 'frame' | 'comment';

export interface ToolMeta {
  label: string;
  /** Single-key shortcut, as shown in the tooltip and read by the keyboard map. */
  key: string;
  icon: IconName;
}

/**
 * Every tool in one table: its name, its shortcut and its icon. The rail, the
 * tooltips and `Editor.onKeyDown` all read from here, so a tool's shortcut
 * cannot drift from the one its tooltip advertises.
 */
export const TOOL_META = {
  select: { label: 'Select', key: 'V', icon: 'select' },
  hand: { label: 'Hand', key: 'H', icon: 'hand' },
  rect: { label: 'Rectangle', key: 'R', icon: 'rect' },
  ellipse: { label: 'Ellipse', key: 'O', icon: 'ellipse' },
  line: { label: 'Line', key: 'L', icon: 'line' },
  sticky: { label: 'Sticky', key: 'N', icon: 'sticky' },
  text: { label: 'Text', key: 'T', icon: 'text' },
  pen: { label: 'Pen', key: 'P', icon: 'pen' },
  connector: { label: 'Connector', key: 'C', icon: 'connector' },
  frame: { label: 'Frame', key: 'F', icon: 'frame' },
  comment: { label: 'Comment', key: 'M', icon: 'comment' },
} satisfies Record<Tool, ToolMeta>;

export const TOOLS = Object.keys(TOOL_META) as Tool[];

/** Lower-case shortcut to tool, derived so the two cannot disagree. */
export const TOOL_BY_KEY: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [TOOL_META[t].key.toLowerCase(), t]));

export interface RailGroup {
  id: string;
  /** Names the group for assistive technology; the rail shows a divider, not a heading. */
  label: string;
  tools: Tool[];
}

/**
 * How the rail is divided. Adding a tool means one entry in `TOOL_META` and
 * one here; a unit test fails if a tool is missing or listed twice. When a
 * group outgrows the rail this is where overflow flyouts will hang.
 */
export const RAIL_GROUPS: RailGroup[] = [
  { id: 'navigate', label: 'Navigate', tools: ['select', 'hand'] },
  { id: 'shapes', label: 'Shapes', tools: ['rect', 'ellipse', 'line'] },
  { id: 'content', label: 'Content', tools: ['sticky', 'text', 'pen'] },
  { id: 'structure', label: 'Structure', tools: ['connector', 'frame', 'comment'] },
];

/** Tools a view-only visitor may still use. */
export const READ_ONLY_TOOLS: Tool[] = ['select', 'hand'];
