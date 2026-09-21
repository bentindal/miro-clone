import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Panel } from '../ui';
import { isEnabled, command } from './commands';
import { CommandMenuItem } from './CommandButton';
import type { Editor } from './Editor';

/**
 * Two menus, chosen by whether anything is selected. Both are lists of
 * command ids: the context menu adds no behaviour of its own, which is the
 * point of the registry.
 */
const ON_SELECTION = ['cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'group', 'ungroup', 'bring-to-front', 'send-to-back'];
const ON_CANVAS = ['paste', 'select-all', '-', 'zoom-fit', 'zoom-reset', 'toggle-grid'];

const MARGIN = 8;

export interface ContextMenuProps {
  editor: Editor;
  /** Where the menu was asked for, in board coordinates. */
  at: { x: number; y: number };
  onClose: () => void;
}

export function ContextMenu({ editor, at, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  // Flip the menu back inside the board rather than letting it run off.
  useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.offsetParent as HTMLElement | null;
    if (!el || !host) return;
    const x = Math.max(MARGIN, Math.min(at.x, host.clientWidth - el.offsetWidth - MARGIN));
    const y = Math.max(MARGIN, Math.min(at.y, host.clientHeight - el.offsetHeight - MARGIN));
    setPos({ x, y });
  }, [at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture, so Escape closes the menu instead of reaching the editor's
    // own cancel command and clearing the selection underneath it.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onClose);
    window.addEventListener('wheel', onClose);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onClose);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  const ids = editor.selection.length > 0 ? ON_SELECTION : ON_CANVAS;
  // A menu of nothing but dead rows is worse than no menu, but a row that is
  // dead beside live ones is information, so only whole-menu emptiness hides.
  if (!ids.some((id) => id !== '-' && isEnabled(command(id), editor))) return null;

  return (
    <Panel
      className="context-menu"
      data-testid="context-menu"
      role="menu"
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {ids.map((id, i) =>
        id === '-' ? (
          <div key={`divider-${i}`} className="ui-divider" data-orientation="horizontal" aria-hidden="true" />
        ) : (
          <CommandMenuItem key={id} editor={editor} id={id} onRun={onClose} />
        ),
      )}
    </Panel>
  );
}
