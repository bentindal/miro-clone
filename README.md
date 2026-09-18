# Whiteboard

An infinite collaborative whiteboard: real-time multi-user editing with
presence, boards saved on a sync server and shared by edit or view links.
[SPEC.md](SPEC.md) tracks what is built; every ticked item links to the
Playwright test that proves it. What comes next is in [ROADMAP.md](ROADMAP.md).

## Stack

- TypeScript, React 19, Vite 7
- Hand-written scene graph rendered to an HTML canvas (`src/model`, `src/render`)
- Yjs for the shared document and per-user undo; y-websocket for transport
- A small Node sync server (`server/`): WebSocket rooms, HTTP API, Postgres persistence
- Vitest for unit tests, Playwright for end-to-end and performance tests

## How collaboration works

Each board is a Yjs document (`shapes` map of per-field maps, `order` array,
`meta` map). The editor keeps its immutable scene graph as a view over that
document: local edits are diffed into the document, remote transactions are
applied back onto the scene (`src/sync/binding.ts`). Undo is a `Y.UndoManager`
tracking only this client's transactions, so undo never reverts someone else's
work. Presence (name, colour, cursor, selection) travels over the awareness
protocol and never touches the document.

The server (`server/src`) keeps one room per open board, relays updates,
drops document writes from view-only links, and persists each update to
Postgres, compacting to a single state blob when the room unloads. Boards are
anonymous: an edit link and a view link, each with a secret token in the URL
fragment, are the only credentials.

## Setup

Prerequisites: Node.js 22 or newer and pnpm 10. If you use corepack,
`corepack enable` installs the pnpm version pinned in `package.json`.

```
git clone https://github.com/bentindal/miro-clone.git
cd miro-clone
pnpm install
pnpm exec playwright install chromium   # browser for the e2e and perf tests
pnpm dev:server                         # sync server on :8787 (PGlite in memory, no database needed)
pnpm dev                                # app on http://localhost:5173, proxies /api and /ws to :8787
```

Without the sync server the app still opens and works in a single tab
("Local only" in the header); nothing is saved.

`pnpm e2e` starts the sync server and builds and serves the app on port 4173
itself, so nothing else needs to be running. If a previous server is still
holding port 8787 or 4173, stop it first or Playwright refuses to start.

### Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `VITE_SYNC_URL` | app build | Public base URL of the sync server. Unset = same origin via the dev/preview proxy. |
| `PORT` | server | Listen port, default 8787. |
| `DATABASE_URL` | server | Postgres connection string. Unset = PGlite in memory (tests, quick local runs). |
| `PGLITE_DIR` | server | Keep PGlite data in this directory instead of memory. |
| `CORS_ORIGIN` | server | Origin allowed to call the API from a browser. `*` in development. |

### Deploying

- **App**: Vercel, from `main`. Set `VITE_SYNC_URL` to the server's public URL
  in the project's environment variables and redeploy. `vercel.json` rewrites
  board URLs to the single page.
- **Server**: any host that runs a long-lived Node process with WebSockets.
  `server/Dockerfile` and `server/fly.toml` cover Fly.io; the commands are at
  the top of `fly.toml`. Attach a Postgres database (`DATABASE_URL`) and set
  `CORS_ORIGIN` to the app's origin. The schema is created on start.

## Commands

```
pnpm dev          # start the app on http://localhost:5173
pnpm dev:server   # start the sync server on :8787 with reload
pnpm build        # typecheck and bundle the app to dist/
pnpm build:server # compile the server to server/dist/
pnpm test         # unit tests, app and server (Vitest)
pnpm e2e          # end-to-end + perf tests (Playwright; starts server, builds and serves dist/)
pnpm perf         # only the 5,000-object frame-time test
pnpm lint         # ESLint
```

## Layout

```
src/model     scene graph, geometry, hit testing, snapping, serialisation
src/render    canvas renderer (culling, batched low-zoom drawing, selection frame, peers)
src/editor    editor state machine (tools, drags, clipboard, keyboard), React UI
src/sync      Yjs binding, board API client, sync session with presence
server/src    sync server: store (Postgres/PGlite), rooms, HTTP + WebSocket app
e2e           Playwright specs, one file per SPEC.md item
```

## Keyboard

| Key | Action |
| --- | --- |
| V H R O L N T P C F | Select, hand, rectangle, ellipse, line, sticky, text, pen, connector, frame |
| Wheel / Ctrl+wheel | Pan / zoom (trackpad pinch) |
| Space + drag, middle drag | Pan |
| Two fingers (touch) | Pan and pinch zoom |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo |
| Ctrl+C / X / V / D | Copy / cut / paste / duplicate |
| Ctrl+G / Ctrl+Shift+G | Group / ungroup |
| ] [ } { | Bring forward, send backward, bring to front, send to back |
| G | Toggle grid snap |
| Alt while dragging | Disable snapping |
| Tab / Shift+Tab (canvas focused) | Select next / previous object |
| Enter | Edit the selected text or frame title |
| Delete, Backspace | Delete selection |
| Esc | Cancel drag, clear selection, back to select tool |
| + - Ctrl+0 Shift+1 | Zoom in, out, reset, fit |
