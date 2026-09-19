import { useEffect } from 'react';
import { Divider, IconButton, Tooltip, useMeasure } from '../ui';
import type { Editor } from './Editor';
import { RAIL_GROUPS, READ_ONLY_TOOLS, TOOL_META } from './tools';
import { useEditorVersion } from './useEditor';

/** Distance from the workspace edge, as set in `app.css`. */
const RAIL_MARGIN = 12;

/**
 * The creation tools, on the left, grouped. Both the grouping and the
 * shortcuts come from `tools.ts`, so placing a new tool is one entry there.
 */
export function ToolRail({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  const [measure, size] = useMeasure({ w: 0, h: 0 });
  // RAIL_MARGIN mirrors the `left` offset in the stylesheet.
  useEffect(() => editor.setInset('left', size.w > 0 ? size.w + RAIL_MARGIN * 2 : 0), [editor, size.w]);
  const readOnly = editor.readOnly;
  return (
    // Buttons never take focus so keyboard shortcuts keep reaching the board.
    <div ref={measure} className="tool-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical" onMouseDown={(e) => e.preventDefault()}>
      {RAIL_GROUPS.map((group, i) => (
        <div key={group.id} className="rail-group" role="group" aria-label={group.label}>
          {i > 0 && <Divider orientation="horizontal" />}
          {group.tools.map((tool) => {
            const meta = TOOL_META[tool];
            return (
              <Tooltip key={tool} label={meta.label} shortcut={meta.key} placement="right">
                <IconButton
                  icon={meta.icon}
                  label={meta.label}
                  variant="ghost"
                  data-tool={tool}
                  aria-keyshortcuts={meta.key}
                  active={editor.tool === tool}
                  disabled={readOnly && !READ_ONLY_TOOLS.includes(tool)}
                  onClick={() => editor.setTool(tool)}
                />
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
