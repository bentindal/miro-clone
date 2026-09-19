import { useEffect } from 'react';
import { Button, IconButton, Panel, useMeasure } from '../ui';
import type { Editor } from './Editor';
import { panelById, panelsIn } from './panels';
import './registerPanels';
import { useEditorVersion } from './useEditor';

/** Distance from the workspace edge, as set in `app.css`. */
const DOCK_MARGIN = 12;

/**
 * The right-hand dock: a strip of tabs, and the open panel beside it. Panels
 * come from the registry, so comments is one entry rather than a special case.
 */
export function Dock({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const [measure, size] = useMeasure({ w: 0, h: 0 });
  // DOCK_MARGIN mirrors the `right` offset in the stylesheet.
  useEffect(() => editor.setInset('right', size.w > 0 ? size.w + DOCK_MARGIN * 2 : 0), [editor, size.w]);
  const panels = panelsIn('right');
  const open = editor.openPanel ? panelById(editor.openPanel) : undefined;
  if (panels.length === 0) return null;

  return (
    <div ref={measure} className="dock" data-testid="dock">
      {open && (
        <Panel
          className="dock-panel"
          data-testid={`panel-${open.id}`}
          role="complementary"
          aria-label={open.title}
          onPointerDown={(e) => e.stopPropagation()}
          header={
            <>
              <strong>{open.title}</strong>
              {open.headerExtra?.(editor)}
              <IconButton icon="close" label={`Close ${open.title.toLowerCase()}`} variant="ghost" size="sm" onClick={() => editor.setOpenPanel(null)} />
            </>
          }
        >
          {open.render(editor)}
        </Panel>
      )}
      <div className="dock-tabs" role="tablist" aria-label="Panels" aria-orientation="vertical">
        {panels.map((p) => {
          const count = p.badge?.(editor) ?? 0;
          return (
            <Button
              key={p.id}
              icon={p.icon}
              variant="ghost"
              role="tab"
              data-action={`toggle-${p.id}`}
              aria-label={count > 0 ? `${p.title}, ${count} open` : p.title}
              aria-selected={editor.openPanel === p.id}
              active={editor.openPanel === p.id}
              onClick={() => editor.setOpenPanel(editor.openPanel === p.id ? null : p.id)}
            >
              {count > 0 ? count : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
