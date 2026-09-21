import { useSyncExternalStore } from 'react';
import { Button, IconButton, Tooltip } from '../ui';
import { command, isActive, isEnabled } from './commands';
import type { Editor } from './Editor';
import { formatShortcut, shortcuts } from './shortcuts';

/** The chord to advertise for a command, following a remap. */
export function useShortcut(id: string): string | undefined {
  const map = useSyncExternalStore(shortcuts.subscribe, shortcuts.get, shortcuts.get);
  return formatShortcut(map[id]?.[0]);
}

export interface CommandButtonProps {
  editor: Editor;
  id: string;
  placement?: 'top' | 'bottom' | 'right';
  onRun?: () => void;
}

/**
 * A command as an icon button. Label, icon, shortcut, disabled and pressed
 * state all come from the registry, so no surface can advertise a key the
 * keyboard does not honour or offer an action the editor would refuse.
 */
export function CommandIconButton({ editor, id, placement = 'top', onRun }: CommandButtonProps) {
  const cmd = command(id);
  const shortcut = useShortcut(id);
  return (
    <Tooltip label={cmd.label} shortcut={shortcut} placement={placement}>
      <IconButton
        icon={cmd.icon}
        label={cmd.label}
        variant="ghost"
        data-action={id}
        disabled={!isEnabled(cmd, editor)}
        active={isActive(cmd, editor)}
        onClick={() => {
          cmd.run(editor);
          onRun?.();
        }}
      />
    </Tooltip>
  );
}

/** The same command as a labelled row in a menu. */
export function CommandMenuItem({ editor, id, onRun }: CommandButtonProps) {
  const cmd = command(id);
  const shortcut = useShortcut(id);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={cmd.icon}
      role="menuitem"
      keepFocus
      data-action={id}
      disabled={!isEnabled(cmd, editor)}
      onClick={() => {
        cmd.run(editor);
        onRun?.();
      }}
    >
      {cmd.label}
      {shortcut && <kbd className="menu-shortcut">{shortcut}</kbd>}
    </Button>
  );
}
