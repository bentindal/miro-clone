import { describe, expect, it } from 'vitest';
import type { Editor } from '../Editor';
import { type PanelDef, panelById, panelsIn, registerPanel } from '../panels';

const def = (id: string): PanelDef => ({ id, slot: 'right', icon: 'comment', title: id, render: () => null });

describe('panel registry', () => {
  // This is the seam UI-1 exists to create: a layers panel, a template
  // library or a shape library docks with one call and no layout change.
  it('adds a panel to a slot with one call', () => {
    const before = panelsIn('right').length;
    registerPanel(def('layers'));
    expect(panelsIn('right')).toHaveLength(before + 1);
    expect(panelById('layers')?.title).toBe('layers');
  });

  it('replaces a panel registered under the same id', () => {
    registerPanel(def('layers'));
    const count = panelsIn('right').length;
    registerPanel({ ...def('layers'), title: 'Layers' });
    expect(panelsIn('right')).toHaveLength(count);
    expect(panelById('layers')?.title).toBe('Layers');
  });

  it('reports a badge count from the editor', () => {
    registerPanel({ ...def('counted'), badge: (e) => e.selection.length });
    const editor = { selection: ['a', 'b'] } as unknown as Editor;
    expect(panelById('counted')?.badge?.(editor)).toBe(2);
  });
});
