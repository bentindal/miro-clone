import type { ReactNode } from 'react';
import type { IconName } from '../ui';
import type { Editor } from './Editor';

export type PanelSlot = 'right';

export interface PanelDef {
  id: string;
  slot: PanelSlot;
  icon: IconName;
  /** Shown in the panel header and as the tab's accessible name. */
  title: string;
  /** Number on the tab, when there is something worth counting. */
  badge?: (editor: Editor) => number;
  /** Controls placed in the header, left of the close button. */
  headerExtra?: (editor: Editor) => ReactNode;
  render: (editor: Editor) => ReactNode;
}

const registry = new Map<string, PanelDef>();

/**
 * Add a panel to a dock. Nothing about the layout has to change: the dock
 * grows a tab and renders `render` when that tab is open. This is the seam a
 * layers panel, a template library or a shape library docks into.
 */
export function registerPanel(def: PanelDef): void {
  registry.set(def.id, def);
}

export function panelsIn(slot: PanelSlot): PanelDef[] {
  return [...registry.values()].filter((p) => p.slot === slot);
}

export function panelById(id: string): PanelDef | undefined {
  return registry.get(id);
}
