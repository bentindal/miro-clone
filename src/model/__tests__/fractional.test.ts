import { describe, expect, it } from 'vitest';
import { assignKeys, compareKeyed, isValidKey, keyBetween } from '../fractional';

describe('keyBetween', () => {
  it('produces keys that sort between their neighbours', () => {
    const first = keyBetween(null, null);
    const before = keyBetween(null, first);
    const after = keyBetween(first, null);
    expect(before < first && first < after).toBe(true);
    const mid = keyBetween(before, first);
    expect(before < mid && mid < first).toBe(true);
  });

  it('never runs out of room when inserting repeatedly at one end or between two keys', () => {
    let a = keyBetween(null, null);
    const b = keyBetween(a, null);
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(a, b);
      expect(a < next && next < b).toBe(true);
      a = next;
    }
    let top = b;
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(top, null);
      expect(next > top).toBe(true);
      top = next;
    }
  });

  it('rejects inverted bounds', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
  });

  it('validates keys', () => {
    expect(isValidKey('a0')).toBe(true);
    expect(isValidKey('a0V')).toBe(true);
    expect(isValidKey('a0V0')).toBe(false);
    expect(isValidKey('a')).toBe(false);
    expect(isValidKey('')).toBe(false);
    expect(isValidKey('a-b')).toBe(false);
    expect(isValidKey(3)).toBe(false);
  });

  it('appending thousands of keys one at a time keeps them short', () => {
    let k: string | null = null;
    let longest = 0;
    for (let i = 0; i < 5000; i++) {
      k = keyBetween(k, null);
      longest = Math.max(longest, k.length);
    }
    expect(longest).toBeLessThanOrEqual(4);
    let low: string | null = null;
    for (let i = 0; i < 500; i++) {
      low = keyBetween(null, low);
      longest = Math.max(longest, low.length);
    }
    expect(longest).toBeLessThanOrEqual(4);
  });
});

describe('assignKeys', () => {
  function check(order: string[], keys: Map<string, string>) {
    const changes = assignKeys(order, keys);
    const merged = new Map(keys);
    for (const [id, k] of changes) merged.set(id, k);
    const sorted = [...order].sort((a, b) => compareKeyed({ key: merged.get(a)!, id: a }, { key: merged.get(b)!, id: b }));
    expect(sorted).toEqual(order);
    return changes;
  }

  it('keys everything when nothing has a key, and stays short for thousands of shapes', () => {
    const changes = check(['a', 'b', 'c'], new Map());
    expect(changes.size).toBe(3);
    const ids = Array.from({ length: 5000 }, (_, i) => `s${i}`);
    const bulk = check(ids, new Map());
    expect(Math.max(...[...bulk.values()].map((v) => v.length))).toBeLessThanOrEqual(4);
  });

  it('changes nothing when keys already sort correctly', () => {
    const keys = new Map([
      ['a', 'a1'],
      ['b', 'a5'],
      ['c', 'a9'],
    ]);
    expect(check(['a', 'b', 'c'], keys).size).toBe(0);
  });

  it('rekeys only the moved item when one item moves', () => {
    const keys = new Map([
      ['a', 'a1'],
      ['b', 'a5'],
      ['c', 'a9'],
      ['d', 'aC'],
    ]);
    const changes = check(['a', 'c', 'd', 'b'], keys);
    expect([...changes.keys()]).toEqual(['b']);
  });

  it('rekeys items with invalid or duplicate keys', () => {
    const keys = new Map([
      ['a', 'a5'],
      ['b', 'a5'],
      ['c', 'bad0'],
    ]);
    const changes = check(['a', 'b', 'c'], keys);
    expect(changes.has('c')).toBe(true);
    expect(changes.size).toBeGreaterThanOrEqual(2);
  });

  it('handles a long reversed list without producing runaway key lengths', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `s${i}`);
    const keys = new Map<string, string>();
    let k: string | null = null;
    for (const id of ids) {
      k = keyBetween(k, null);
      keys.set(id, k);
    }
    const reversed = [...ids].reverse();
    const changes = check(reversed, keys);
    expect(changes.size).toBe(199);
    const longest = Math.max(...[...changes.values()].map((v) => v.length));
    expect(longest).toBeLessThan(12);
  });
});
