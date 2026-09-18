import type { Editor } from './editor/Editor';
import { serializeScene } from './model/serialize';
import type { SyncSession } from './sync/session';

/**
 * A small, stable surface for end-to-end tests to inspect editor state.
 * Everything returned is plain JSON so it survives page.evaluate.
 */
export function installTestHooks(editor: Editor, session: SyncSession | null = null): void {
  const api = {
    editor,
    session,
    sync: () => (session ? { status: session.status, synced: session.synced, role: session.info.role, boardId: session.info.boardId, editLink: session.info.editLink, viewLink: session.info.viewLink } : null),
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
    history: () => ({ undo: editor.undoManager.undoStack.length, redo: editor.undoManager.redoStack.length }),
    peers: () => editor.peers.map((p) => ({ ...p })),
    readOnly: () => editor.readOnly,
    title: () => editor.title,
    handles: () => editor.selectionFrame?.handles ?? null,
    guides: () => editor.guides.map((g) => ({ ...g })),
    tool: () => editor.tool,
  };
  (window as unknown as { __wb: typeof api }).__wb = api;
}
