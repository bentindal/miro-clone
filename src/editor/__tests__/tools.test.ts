import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../ui/Icon';
import { RAIL_GROUPS, READ_ONLY_TOOLS, TOOL_BY_KEY, TOOL_META, TOOLS } from '../tools';

describe('tools', () => {
  // The rail renders these groups and nothing else, so a tool missing from
  // them would be unreachable by mouse. Fail here rather than in the UI.
  it('place every tool in exactly one rail group', () => {
    const placed = RAIL_GROUPS.flatMap((g) => g.tools);
    expect([...placed].sort()).toEqual([...TOOLS].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('give every tool a unique shortcut that maps back to it', () => {
    const keys = TOOLS.map((t) => TOOL_META[t].key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const tool of TOOLS) expect(TOOL_BY_KEY[TOOL_META[tool].key.toLowerCase()]).toBe(tool);
    expect(Object.keys(TOOL_BY_KEY)).toHaveLength(TOOLS.length);
  });

  it('name an icon that exists', () => {
    for (const tool of TOOLS) expect(ICON_NAMES).toContain(TOOL_META[tool].icon);
  });

  it('let a viewer select and pan, and nothing else', () => {
    expect(READ_ONLY_TOOLS).toEqual(['select', 'hand']);
    for (const tool of READ_ONLY_TOOLS) expect(TOOLS).toContain(tool);
  });
});
