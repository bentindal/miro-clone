import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Icon, toast } from '../ui';
import { COMMANDS, type CommandGroup, GROUP_LABELS } from './commands';
import type { Editor } from './Editor';
import { chordFor, formatShortcut, shortcuts } from './shortcuts';

const GROUPS: CommandGroup[] = ['tool', 'edit', 'arrange', 'view', 'board'];

/** Keys that cannot be a chord on their own, because the recorder needs them. */
const RESERVED = ['Escape', 'Tab'];

/**
 * Every command and the key that runs it, remappable. This exists because the
 * registry made it cheap: the list is the registry, and rebinding is one call
 * that the keyboard, the tooltips, the menus and the palette all pick up.
 */
export function ShortcutsBody({ editor }: { editor: Editor }) {
  const map = useSyncExternalStore(shortcuts.subscribe, shortcuts.get, shortcuts.get);
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      setRecording(null);
      if (RESERVED.includes(e.key)) return;
      const chord = chordFor(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });
      const taken = shortcuts.conflict(chord, recording);
      shortcuts.set(recording, [chord]);
      if (taken) toast(`${formatShortcut(chord)} no longer runs ${taken.label}`, 'info');
    };
    // Capture, so the chord being recorded does not also run its old command.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

  return (
    <div className="shortcuts-body" data-testid="shortcuts-panel">
      <p className="shortcuts-hint">Pick a shortcut to change it, then press the keys you want. Escape leaves it alone.</p>
      {GROUPS.map((group) => (
        <section key={group} className="shortcut-group">
          <h3>{GROUP_LABELS[group]}</h3>
          {COMMANDS.filter((c) => c.group === group).map((cmd) => (
            <div key={cmd.id} className="shortcut-row" data-command={cmd.id}>
              <Icon name={cmd.icon} />
              <span className="shortcut-label">{cmd.label}</span>
              <Button
                size="sm"
                toggle="outline"
                active={recording === cmd.id}
                data-action={`rebind-${cmd.id}`}
                aria-label={`Change the shortcut for ${cmd.label}`}
                onClick={() => setRecording((r) => (r === cmd.id ? null : cmd.id))}
              >
                {recording === cmd.id ? 'Press a key…' : (formatShortcut(map[cmd.id]?.[0]) ?? 'None')}
              </Button>
            </div>
          ))}
        </section>
      ))}
      <Button icon="reset" variant="ghost" size="sm" data-action="reset-shortcuts" onClick={() => shortcuts.resetAll()}>
        Reset all to defaults
      </Button>
      {editor.readOnly && <p className="shortcuts-hint">This board is view-only, so the commands that change it stay unavailable whatever they are bound to.</p>}
    </div>
  );
}
