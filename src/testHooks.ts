import type { Editor } from './editor/Editor';
import { serializeScene } from './model/serialize';

/**
 * A small, stable surface for end-to-end tests to inspect editor state.
 * Everything returned is plain JSON so it survives page.evaluate.
 */
export function installTestHooks(editor: Editor): void {
  const api = {
    editor,
    shapes: () => serializeScene(editor.scene).shapes,
    shape: (id: string) => editor.scene.get(id) ?? null,
    bounds: (id: string) => editor.scene.bounds(id),
    selection: () => [...editor.selection],
    camera: () => ({ ...editor.camera }),
    order: () => editor.scene.ids(),
    connectorPoints: (id: string) => {
      const s = editor.scene.get(id);
      return s && s.type === 'connector' ? editor.scene.connectorPoints(s) : null;
    },
    connectorPath: (id: string) => {
      const s = editor.scene.get(id);
      return s && s.type === 'connector' ? editor.scene.connectorGeometry(s).points : null;
    },
    load: (data: unknown) => editor.loadBoardFile(data),
    renderNow: () => editor.renderNow(),
    stats: () => ({ ...editor.lastRenderStats, ms: editor.lastRenderMs }),
    history: () => ({ undo: editor.history.undoDepth, redo: editor.history.redoDepth }),
    handles: () => editor.selectionFrame?.handles ?? null,
    tool: () => editor.tool,
  };
  (window as unknown as { __wb: typeof api }).__wb = api;
}
