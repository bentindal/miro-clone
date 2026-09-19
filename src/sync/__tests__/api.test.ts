import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NoSyncServerError, createBoard, getBoard } from '../api';

/** Stand in for `fetch`. A fresh Response per call: a body reads only once. */
function serve(body: string, init: { status?: number; type?: string } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: init.status ?? 200, headers: init.type === undefined ? {} : { 'content-type': init.type } })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the sync API client', () => {
  it('returns the body when the server answers in JSON', async () => {
    serve(JSON.stringify({ id: 'b1', title: 'Board', role: 'edit' }), { type: 'application/json' });
    await expect(getBoard('b1', 't')).resolves.toMatchObject({ id: 'b1', role: 'edit' });
  });

  it('reports what the server said when it refuses', async () => {
    serve(JSON.stringify({ error: 'Unknown board' }), { status: 404, type: 'application/json; charset=utf-8' });
    await expect(getBoard('b1', 't')).rejects.toMatchObject({ status: 404, message: 'Unknown board' });
    await expect(getBoard('b1', 't')).rejects.toBeInstanceOf(ApiError);
  });

  // The bug this exists for: a static host with no sync server answers
  // /api/boards with its own HTML 404. Read as an ApiError that is "this board
  // does not exist", which sent people to a page whose only way out — starting
  // a new board — failed exactly the same way.
  it('treats an HTML answer as no sync server, not as a missing board', async () => {
    serve('<!doctype html><title>404</title>', { status: 404, type: 'text/html; charset=utf-8' });
    await expect(getBoard('b1', 't')).rejects.toBeInstanceOf(NoSyncServerError);
    await expect(createBoard()).rejects.toBeInstanceOf(NoSyncServerError);
  });

  // The other shape the same misconfiguration takes: a catch-all rewrite that
  // serves the app itself, with a 200, for every path.
  it('treats the app being served in place of the API the same way', async () => {
    serve('<!doctype html><div id="root"></div>', { status: 200, type: 'text/html' });
    await expect(getBoard('b1', 't')).rejects.toBeInstanceOf(NoSyncServerError);
  });

  it('treats a response with no content type as no sync server', async () => {
    serve('', { status: 404 });
    await expect(getBoard('b1', 't')).rejects.toBeInstanceOf(NoSyncServerError);
  });

  it('treats an unreachable server as no sync server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createBoard()).rejects.toBeInstanceOf(NoSyncServerError);
  });

  it('treats a JSON content type with an unparseable body as no sync server', async () => {
    serve('not json', { status: 200, type: 'application/json' });
    await expect(getBoard('b1', 't')).rejects.toBeInstanceOf(NoSyncServerError);
  });
});
