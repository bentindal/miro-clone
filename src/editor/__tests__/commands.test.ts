import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../ui';
import { rect } from '../../model/__tests__/fixtures';
import { COMMANDS, command, commandsIn, isEnabled } from '../commands';
import { Editor } from '../Editor';
import { ShortcutStore, chordFor, formatShortcut, runShortcut } from '../shortcuts';
import { TOOLS, TOOL_META } from '../tools';
import type { Modifiers } from '../Editor';

const NONE: Modifiers = { shift: false, ctrl: false, alt: false };

/** A board with two rectangles, both selected. */
function board(): Editor {
  const editor = new Editor();
  editor.scene.add(rect('a', 0, 0, 50, 50));
  editor.scene.add(rect('b', 100, 0, 50, 50));
  editor.select(['a', 'b']);
  return editor;
}

/**
 * The key press that produces a chord, which is what a browser would report.
 * Shift is inferred rather than declared, because the chord spells a shifted
 * punctuation key as the character it produces.
 */
function press(chord: string): { key: string; mods: Modifiers } {
  const parts = chord.split('+');
  // `Ctrl++` splits into an empty last part; the key is the final `+`.
  const key = parts.pop() || '+';
  const mods = { shift: parts.includes('Shift'), ctrl: parts.includes('Ctrl'), alt: parts.includes('Alt') };
  return { key, mods };
}

describe('the command registry', () => {
  it('gives every command a unique id', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every command an icon that exists', () => {
    const missing = COMMANDS.filter((c) => !ICON_NAMES.includes(c.icon)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it('never binds one chord to two commands', () => {
    const owners = new Map<string, string>();
    const clashes: string[] = [];
    for (const cmd of COMMANDS) {
      for (const chord of cmd.shortcut ?? []) {
        const owner = owners.get(chord);
        if (owner) clashes.push(`${chord}: ${owner} and ${cmd.id}`);
        else owners.set(chord, cmd.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  // A chord that no key press can produce is a shortcut that silently never
  // fires, which is exactly what this table exists to prevent.
  it('only declares chords a key press can produce', () => {
    const unreachable: string[] = [];
    for (const cmd of COMMANDS) {
      for (const chord of cmd.shortcut ?? []) {
        const { key, mods } = press(chord);
        if (chordFor(key, mods) !== chord) unreachable.push(`${cmd.id}: ${chord}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('carries every tool, with the shortcut the rail advertises', () => {
    for (const tool of TOOLS) {
      const cmd = command(`tool-${tool}`);
      expect(cmd.shortcut).toEqual([TOOL_META[tool].key.toUpperCase()]);
      expect(cmd.icon).toBe(TOOL_META[tool].icon);
    }
    expect(commandsIn('tool')).toHaveLength(TOOLS.length);
  });

  it('answers isEnabled on a fresh board without reaching for something that is not there', () => {
    const editor = new Editor();
    for (const cmd of COMMANDS) expect(() => isEnabled(cmd, editor)).not.toThrow();
  });

  it('disables every writing command on a view-only board, and no other', () => {
    const editor = board();
    const before = COMMANDS.filter((c) => isEnabled(c, editor)).map((c) => c.id);
    editor.setReadOnly(true);
    const after = new Set(COMMANDS.filter((c) => isEnabled(c, editor)).map((c) => c.id));
    const lost = before.filter((id) => !after.has(id));
    expect(lost.sort()).toEqual(before.filter((id) => command(id).writes).sort());
    expect(lost.length).toBeGreaterThan(0);
  });
});

describe('dispatch', () => {
  it('runs the command a chord names', () => {
    const editor = board();
    expect(runShortcut(editor, 'Delete', NONE)).toBe(true);
    expect(editor.scene.get('a')).toBeUndefined();
    expect(runShortcut(editor, 'z', { ...NONE, ctrl: true })).toBe(true);
    expect(editor.scene.get('a')).toBeDefined();
  });

  it('tells Ctrl+G, G and Ctrl+Shift+G apart', () => {
    const editor = board();
    const grid = editor.gridSnap;
    runShortcut(editor, 'g', NONE);
    expect(editor.gridSnap).toBe(!grid);

    runShortcut(editor, 'g', { ...NONE, ctrl: true });
    expect(editor.scene.get('a')?.parentId).not.toBeNull();

    runShortcut(editor, 'G', { ...NONE, ctrl: true, shift: true });
    expect(editor.scene.get('a')?.parentId).toBeNull();
  });

  it('switches tools by their advertised key, in either case', () => {
    const editor = board();
    expect(runShortcut(editor, 'r', NONE)).toBe(true);
    expect(editor.tool).toBe('rect');
    expect(runShortcut(editor, 'V', NONE)).toBe(true);
    expect(editor.tool).toBe('select');
  });

  it('reports an unbound key as unconsumed, so the browser keeps it', () => {
    const editor = board();
    expect(runShortcut(editor, 'q', NONE)).toBe(false);
    expect(runShortcut(editor, 'F5', NONE)).toBe(false);
  });

  it('refuses a writing command on a view-only board but allows the rest', () => {
    const editor = board();
    editor.setReadOnly(true);
    expect(runShortcut(editor, 'Delete', NONE)).toBe(false);
    expect(editor.scene.get('a')).toBeDefined();
    editor.clearSelection();
    expect(runShortcut(editor, 'a', { ...NONE, ctrl: true })).toBe(true);
    expect(editor.selection).toHaveLength(2);
  });

  it('nudges by one, and by ten with shift', () => {
    const editor = board();
    editor.select(['a']);
    runShortcut(editor, 'ArrowRight', NONE);
    expect(editor.scene.mustGet('a').x).toBe(1);
    runShortcut(editor, 'ArrowRight', { ...NONE, shift: true });
    expect(editor.scene.mustGet('a').x).toBe(11);
  });

  it('honours a remapped key and stops honouring the old one', () => {
    const editor = board();
    const store = new ShortcutStore(null);
    store.set('delete', ['Ctrl+Backspace']);
    expect(runShortcut(editor, 'Delete', NONE, store)).toBe(false);
    expect(runShortcut(editor, 'Backspace', { ...NONE, ctrl: true }, store)).toBe(true);
    expect(editor.scene.get('a')).toBeUndefined();
  });
});

describe('formatting a chord', () => {
  it('spells a shifted digit the way a person would say it', () => {
    expect(formatShortcut('!')).toBe('Shift+1');
    expect(formatShortcut('Ctrl+Z')).toBe('Ctrl+Z');
    expect(formatShortcut(undefined)).toBeUndefined();
  });
});
