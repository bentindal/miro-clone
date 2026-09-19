# Whiteboard

An infinite collaborative whiteboard: real-time multi-user editing with
presence, boards saved on a sync server and shared by edit or view links.
[SPEC.md](SPEC.md) tracks what is built; every ticked item links to the
Playwright test that proves it. What comes next is in [ROADMAP.md](ROADMAP.md),
and the interface work in [UI-ROADMAP.md](UI-ROADMAP.md).

## Stack

- TypeScript, React 19, Vite 7
- Hand-written scene graph rendered to an HTML canvas (`src/model`, `src/render`)
- Yjs for the shared document and per-user undo; y-websocket for transport
- A sync server in two interchangeable flavours: a Cloudflare Worker with one
  Durable Object per board (`worker/`, runs free) and a Node process with
  Postgres (`server/`). Both wrap the same protocol core.
- Vitest for unit tests, Playwright for end-to-end and performance tests

## How collaboration works

Each board is a Yjs document (`shapes` map of per-field maps, `order` array,
`meta` map). The editor keeps its immutable scene graph as a view over that
document: local edits are diffed into the document, remote transactions are
applied back onto the scene (`src/sync/binding.ts`). Undo is a `Y.UndoManager`
tracking only this client's transactions, so undo never reverts someone else's
work. Presence (name, colour, cursor, selection) travels over the awareness
protocol and never touches the document.

A room (`server/src/protocol.ts`) relays updates between the sockets on a
board, drops document writes from view-only links, and hands every update to
a persistence hook. The Cloudflare Worker (`worker/`) gives each board its own
Durable Object with a private SQLite database and hibernating WebSockets, so
an idle board costs nothing. The Node server (`server/`) keeps rooms in memory
and persists to Postgres. Boards are anonymous: an edit link and a view link,
each with a secret token in the URL fragment, are the only credentials.

## Setup

Prerequisites: Node.js 22 or newer and pnpm 10. If you use corepack,
`corepack enable` installs the pnpm version pinned in `package.json`.

```
git clone https://github.com/bentindal/miro-clone.git
cd miro-clone
pnpm install
pnpm exec playwright install chromium   # browser for the e2e and perf tests
pnpm dev:server                         # Node sync server on :8787 (PGlite in memory, no database needed)
pnpm dev                                # app on http://localhost:5173, proxies /api and /ws to :8787
```

To develop against the Cloudflare flavour instead, run `pnpm dev:worker` (port
8788, a real Workers runtime locally) and start the app with
`SYNC_PROXY_TARGET=http://localhost:8788 pnpm dev`.

Without the sync server the app still opens and works in a single tab
("Local only" in the header); nothing is saved.

`pnpm e2e` starts both sync servers and builds and serves the app on ports
4173 and 4174 itself, so nothing else needs to be running. It runs every test
against the Node server and the collaboration suite again against the Worker.
If a previous process is still holding one of ports 8787, 8788, 4173 or 4174,
stop it first or Playwright refuses to start.

### Environment

| Variable | Where | Meaning |
| --- | --- | --- |
| `VITE_SYNC_URL` | app build | Public base URL of the sync server. Unset = same origin via the dev/preview proxy. |
| `CORS_ORIGIN` | worker (`wrangler.toml` vars) and server | Origin allowed to call the API from a browser. |
| `PORT` | server | Listen port, default 8787. |
| `DATABASE_URL` | server | Postgres connection string. Unset = PGlite in memory (tests, quick local runs). |
| `PGLITE_DIR` | server | Keep PGlite data in this directory instead of memory. |

### Deploying for free

The app on Vercel's Hobby plan and the sync server on Cloudflare's Workers
Free plan cost nothing and need no credit card. Boards persist in Durable
Object storage; idle boards hibernate.

1. Sync server. Once, from the repository root:
   ```
   pnpm --filter whiteboard-worker exec wrangler login
   pnpm deploy:worker
   ```
   The output ends with the Worker's URL, like
   `https://whiteboard-sync.<account>.workers.dev`. Check
   `<that url>/healthz` answers `{"ok":true}`. If the app's origin is not the
   default in `worker/wrangler.toml`, change `CORS_ORIGIN` there first.
2. App. In the Vercel project, Settings, Environment Variables, add
   `VITE_SYNC_URL` = the Worker URL (Production, and Preview if wanted), then
   redeploy the latest production deployment. It is a build-time variable.
3. Open the site: New board creates one, the header shows "Live" instead of
   "Local only", and Share offers the two links. The home page remembers the
   boards this browser has opened.

Free plan limits that matter: 100,000 requests a day across the account
(outgoing WebSocket messages are free; incoming ones count 20:1), and no
overage billing, so beyond the cap the Worker errors until the next day
instead of charging.

### Deploying the Node flavour instead

Any host that runs a long-lived Node process with WebSockets.
`server/Dockerfile` and `server/fly.toml` cover Fly.io (paid: no free tier
for new accounts); the commands are at the top of `fly.toml`. Attach a
Postgres database (`DATABASE_URL`, Neon's free tier works) and set
`CORS_ORIGIN` to the app's origin. The schema is created on start.

## Commands

```
pnpm dev          # start the app on http://localhost:5173
pnpm dev:server   # start the Node sync server on :8787 with reload
pnpm dev:worker   # start the Cloudflare Worker locally on :8788
pnpm deploy:worker # deploy the Worker (after wrangler login)
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
server/src    protocol core (shared), Node sync server: store (Postgres/PGlite), rooms, HTTP + WebSocket app
worker/src    Cloudflare Worker + BoardRoom Durable Object (SQLite storage, hibernating WebSockets)
e2e           Playwright specs, one file per SPEC.md item
```

## Keyboard

| Key | Action |
| --- | --- |
| V H R O L N T P C F M | Select, hand, rectangle, ellipse, line, sticky, text, pen, connector, frame, comment |
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
| Enter | Edit the selected text, frame title or connector label |
| Delete, Backspace | Delete selection |
| Esc | Cancel drag, clear selection, back to select tool |
| + - Ctrl+0 Shift+1 | Zoom in, out, reset, fit |
