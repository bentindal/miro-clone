import { describe, expect, it } from 'vitest';
import { Scene } from '../scene';
import { deserializeScene, sceneFromJSON, sceneToJSON, serializeScene } from '../serialize';
import { connector, ellipse, frame, group, line, pen, rect, sticky } from './fixtures';
import type { TextShape } from '../types';

function fullScene(): Scene {
  const s = new Scene();
  s.add(frame('f', -100, -100, 1000, 1000));
  s.add(rect('r', 0, 0, 100, 50, { rotation: 0.3, fill: '#abc', parentId: 'f' }));
  s.add(ellipse('e', 200, 0, 80, 80));
  s.add(line('l', 0, 200, 100, 250));
  s.add(pen('p', 300, 300, [{ x: 0, y: 0 }, { x: 5, y: 7 }, { x: 10, y: 3 }]));
  s.add(sticky('n', 400, 400, 'hello\nworld'));
  const t: TextShape = { type: 'text', id: 't', parentId: null, x: 1, y: 2, w: 3, h: 4, rotation: 0, text: 'txt', fontSize: 20, color: '#123' };
  s.add(t);
  s.add(group('g'));
  s.setParent('e', 'g');
  s.setParent('l', 'g');
  s.add(connector('k', 'r', 'e'));
  s.add(connector('k2', null, 'n', { x: 5, y: 5 }));
  return s;
}

describe('serialisation', () => {
  it('round trips every shape type, order and hierarchy', () => {
    const s = fullScene();
    const json = sceneToJSON(s);
    const back = sceneFromJSON(json);
    expect(back.ids()).toEqual(s.ids());
    expect(back.all()).toEqual(s.all());
    expect(JSON.parse(sceneToJSON(back))).toEqual(JSON.parse(json));
  });

  it('writes a versioned envelope', () => {
    const file = serializeScene(fullScene());
    expect(file.format).toBe('whiteboard');
    expect(file.version).toBe(1);
    expect(file.shapes.length).toBe(10);
  });

  it('rejects malformed input', () => {
    expect(() => deserializeScene(null)).toThrow();
    expect(() => deserializeScene({ format: 'other', version: 1, shapes: [] })).toThrow(/Not a whiteboard/);
    expect(() => deserializeScene({ format: 'whiteboard', version: 99, shapes: [] })).toThrow(/version/);
    expect(() => deserializeScene({ format: 'whiteboard', version: 1, shapes: [{ type: 'rect', id: 'a' }] })).toThrow(/Invalid number/);
    expect(() => deserializeScene({ format: 'whiteboard', version: 1, shapes: [{ type: 'blob', id: 'a' }] })).toThrow(/Unknown shape type/);
  });

  it('rejects dangling references', () => {
    const s = new Scene();
    s.add(rect('a', 0, 0, 1, 1, { parentId: 'missing' }));
    expect(() => deserializeScene(serializeScene(s))).toThrow(/missing parent/);
    const s2 = new Scene();
    s2.add(connector('k', 'nope', null));
    expect(() => deserializeScene(serializeScene(s2))).toThrow(/missing shape/);
  });

  it('fills defaults for optional fields', () => {
    const back = deserializeScene({
      format: 'whiteboard',
      version: 1,
      shapes: [{ type: 'sticky', id: 'n', x: 0, y: 0, w: 10, h: 10 }],
    });
    expect(back.get('n')).toMatchObject({ rotation: 0, text: '', parentId: null });
  });
});
