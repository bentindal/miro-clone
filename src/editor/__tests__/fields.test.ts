import { describe, expect, it } from 'vitest';
import type { Shape, ShapeType } from '../../model/types';
import { connector, ellipse, frame, group, image, line, pen, rect, sticky, text as textShape } from '../../model/__tests__/fixtures';
import { FIELDS, FIELD_LIST, fieldsFor, patchFor, shapesFor, valueOf } from '../fields';

const SHAPE_TYPES: ShapeType[] = ['rect', 'ellipse', 'line', 'pen', 'sticky', 'text', 'image', 'frame', 'group', 'connector'];

const text = (id: string, fontSize = 14, color = '#222222'): Shape => textShape(id, 0, 0, { fontSize, color, w: 100, h: 20 });

const SAMPLES: Partial<Record<ShapeType, Shape>> = {
  rect: rect('r', 0, 0, 10, 10),
  ellipse: ellipse('e', 0, 0, 10, 10),
  line: line('l', 0, 0, 10, 10),
  pen: pen('p', 0, 0, [{ x: 0, y: 0 }]),
  sticky: sticky('n', 0, 0),
  text: text('t'),
  image: image('i', 0, 0),
  connector: connector('c', null, null),
};

/** A value the field accepts that differs from what the shape currently holds. */
function otherValue(field: Exclude<(typeof FIELD_LIST)[number], { kind: 'action' }>, shape: Shape): unknown {
  const current = (field.read as (s: Shape) => unknown)(shape);
  switch (field.kind) {
    case 'color':
      return current === '#010203' ? '#040506' : '#010203';
    case 'text':
      return 'a different label';
    case 'tags':
      return [...(current as readonly string[]), 'a-tag'];
    case 'number':
    case 'enum':
      return (field.options as readonly unknown[]).find((o) => o !== current);
  }
}

describe('field descriptors', () => {
  it('give every field a unique id and name real shape types', () => {
    const ids = FIELD_LIST.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const field of FIELD_LIST) {
      expect(field.types.length).toBeGreaterThan(0);
      for (const t of field.types) expect(SHAPE_TYPES).toContain(t);
    }
  });

  it('read a value off every shape type they claim', () => {
    for (const field of FIELD_LIST) {
      if (field.kind === 'action') continue;
      for (const t of field.types) {
        const shape = SAMPLES[t];
        expect(shape, `no sample for ${t}`).toBeDefined();
        expect(field.read(shape!), `${field.id} on ${t}`).toBeDefined();
      }
    }
  });

  // The point of the table: one entry is enough for the property bar to show
  // the control, `setStyle` to accept the value and the shape to keep it. A
  // field that only half-declares itself fails here rather than in the UI.
  it('write a value that reads back, for every field and every type it claims', () => {
    for (const field of FIELD_LIST) {
      if (field.kind === 'action') continue;
      for (const t of field.types) {
        const shape = SAMPLES[t]!;
        const next = otherValue(field, shape);
        expect(next, `${field.id} has no second option`).toBeDefined();
        const changes = patchFor(shape, { [field.key]: next } as never);
        expect(Object.keys(changes).length, `${field.id} on ${t} wrote nothing`).toBeGreaterThan(0);
        const patched = { ...shape, ...changes } as Shape;
        expect(field.read(patched), `${field.id} on ${t}`).toEqual(next);
      }
    }
  });
});

describe('fieldsFor', () => {
  // A union, not an intersection: selecting a rectangle and a line should
  // still offer stroke, and apply it to both. Fill applies to the rectangle.
  it('offers every field the selection brings', () => {
    const ids = fieldsFor([rect('r', 0, 0, 10, 10), line('l', 0, 0, 10, 10)]).map((f) => f.id);
    expect(ids).toContain('fill');
    expect(ids).toContain('stroke');
    expect(ids).toContain('width');
    expect(ids).not.toContain('font-size');
  });

  it('offers nothing for shapes with no editable properties', () => {
    expect(fieldsFor([frame('f', 0, 0, 10, 10), group('g')])).toEqual([]);
  });

  it('narrows a field to the shapes that have it', () => {
    const shapes = [rect('r', 0, 0, 10, 10), line('l', 0, 0, 10, 10)];
    expect(shapesFor(FIELDS.fill, shapes).map((s) => s.id)).toEqual(['r']);
    expect(shapesFor(FIELDS.stroke, shapes).map((s) => s.id)).toEqual(['r', 'l']);
  });

  it('gives sticky notes paper colours, but only on their own', () => {
    expect(FIELDS.fill.palette([sticky('n', 0, 0)])).toContain('#fff59d');
    expect(FIELDS.fill.palette([sticky('n', 0, 0), rect('r', 0, 0, 10, 10)])).not.toContain('#fff59d');
  });
});

describe('patchFor', () => {
  it('applies only the properties a shape has', () => {
    const patch = { fill: '#ff0000', strokeWidth: 8, fontSize: 32 };
    expect(patchFor(rect('r', 0, 0, 10, 10), patch)).toEqual({ fill: '#ff0000', strokeWidth: 8 });
    expect(patchFor(sticky('n', 0, 0), patch)).toEqual({ fill: '#ff0000' });
    expect(patchFor(line('l', 0, 0, 10, 10), patch)).toEqual({ strokeWidth: 8 });
    expect(patchFor(text('t'), patch)).toEqual({ fontSize: 32 });
    expect(patchFor(frame('f', 0, 0, 10, 10), patch)).toEqual({});
  });

  it('rewrites a connector end rather than replacing it', () => {
    const c = connector('c', 'a', 'b', { x: 1, y: 2 });
    expect(patchFor(c, { startAnchor: 'left' })).toEqual({ start: { shapeId: 'a', point: { x: 1, y: 2 }, anchor: 'left' } });
  });

  it('ignores a patch that names nothing on the shape', () => {
    expect(patchFor(rect('r', 0, 0, 10, 10), { label: 'x' })).toEqual({});
  });
});

describe('valueOf', () => {
  it('reports the shared value when the shapes agree', () => {
    const shapes = [rect('a', 0, 0, 10, 10, { fill: '#123456' }), rect('b', 0, 0, 10, 10, { fill: '#123456' })];
    expect(valueOf(FIELDS.fill, shapes)).toEqual({ value: '#123456', mixed: false });
  });

  // Showing the first shape's value is a lie the control writes back on the
  // next click, quietly changing the shapes that were already correct.
  it('reports mixed when they disagree', () => {
    const shapes = [rect('a', 0, 0, 10, 10, { fill: '#111111' }), rect('b', 0, 0, 10, 10, { fill: '#222222' })];
    expect(valueOf(FIELDS.fill, shapes)).toEqual({ value: undefined, mixed: true });
  });

  it('reports neither for an empty selection', () => {
    expect(valueOf(FIELDS.fill, [])).toEqual({ value: undefined, mixed: false });
  });
});
