import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Panel } from '../ui';
import { COMMANDS, type Command, GROUP_LABELS, isEnabled } from './commands';
import type { Editor } from './Editor';
import { formatShortcut, shortcuts } from './shortcuts';
import { useEditorVersion } from './useEditor';

/** Substring match on the label and on the group, so "view" finds the zoom commands. */
function matches(cmd: Command, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return cmd.label.toLowerCase().includes(q) || GROUP_LABELS[cmd.group].toLowerCase().includes(q);
}

/**
 * Ctrl+K. Every command that is worth picking out of a list, filtered by
 * name, with the key that also runs it. Disabled commands are listed rather
 * than hidden: "Group is there but greyed" answers a question that "Group is
 * missing" does not.
 */
export function CommandPalette({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const map = useSyncExternalStore(shortcuts.subscribe, shortcuts.get, shortcuts.get);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const open = editor.paletteOpen;

  // Each opening starts from a clean query, not the last one's leftovers.
  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  const rows = useMemo(() => COMMANDS.filter((c) => c.inPalette !== false && matches(c, query)), [query]);
  const runnable = rows.filter((c) => isEnabled(c, editor));
  // The cursor addresses the runnable rows, so it can never land on a dead one.
  const active = runnable.length === 0 ? null : runnable[Math.min(cursor, runnable.length - 1)];

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, []);

  if (!open) return null;

  const move = (delta: number) => {
    if (runnable.length === 0) return;
    setCursor((c) => (Math.min(c, runnable.length - 1) + delta + runnable.length) % runnable.length);
  };

  const run = (cmd: Command) => {
    editor.setPaletteOpen(false);
    cmd.run(editor);
  };

  return (
    <div className="palette-backdrop" data-testid="palette-backdrop" onPointerDown={() => editor.setPaletteOpen(false)}>
      <Panel
        className="palette"
        data-testid="command-palette"
        role="dialog"
        aria-label="Command palette"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          className="ui-input palette-input"
          data-testid="palette-input"
          aria-label="Search commands"
          placeholder="Search commands…"
          value={query}
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            // The board's own key handler ignores inputs, so the palette has
            // to own every key it wants while the field has focus.
            e.stopPropagation();
            if (e.key === 'ArrowDown') {
              move(1);
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              move(-1);
              e.preventDefault();
            } else if (e.key === 'Enter') {
              if (active) run(active);
              e.preventDefault();
            } else if (e.key === 'Escape') {
              editor.setPaletteOpen(false);
              e.preventDefault();
            }
          }}
        />
        <div className="palette-list" role="listbox" aria-label="Commands" ref={listRef} data-testid="palette-list">
          {rows.length === 0 && <p className="palette-empty">No command matches “{query}”.</p>}
          {rows.map((cmd) => {
            const enabled = isEnabled(cmd, editor);
            return (
              <Button
                key={cmd.id}
                className="palette-row"
                variant="ghost"
                icon={cmd.icon}
                role="option"
                keepFocus
                aria-selected={cmd === active}
                data-active={cmd === active}
                data-action={cmd.id}
                disabled={!enabled}
                onClick={() => run(cmd)}
              >
                <span className="palette-label">{cmd.label}</span>
                <span className="palette-group">{GROUP_LABELS[cmd.group]}</span>
                {map[cmd.id]?.[0] && <kbd className="menu-shortcut">{formatShortcut(map[cmd.id][0])}</kbd>}
              </Button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
