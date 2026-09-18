/**
 * Fractional index keys: strings that sort lexicographically and always
 * admit a new key strictly between any two existing ones. Each shape carries
 * one, so concurrent reorders converge to one total order with no duplicates
 * (ties on equal keys break by id).
 *
 * A key is an integer part followed by an optional fraction, both in a
 * 62-symbol alphabet. The integer part's first character encodes its length
 * ('a' = one digit, 'b' = two, ... for positive; 'Z' = one digit, 'Y' = two,
 * ... for negative), so appending at either end grows keys logarithmically
 * while inserting between neighbours only extends the fraction. The
 * fraction never ends in the lowest digit. This is the scheme from the
 * `fractional-indexing` package, reimplemented so the Worker and the app
 * share one small dependency-free file.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;
const SMALLEST = 'A' + '0'.repeat(26);

/** A key strictly between `a` and `b`; `null` stands for the open ends. */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validate(a);
  if (b !== null) validate(b);
  if (a !== null && b !== null && a >= b) throw new Error(`keyBetween: ${a} is not below ${b}`);
  if (a === null) {
    if (b === null) return 'a0';
    const ib = integerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST) return ib + midpoint('', fb);
    if (ib < b) return ib;
    const res = decrementInteger(ib);
    if (res === undefined) throw new Error('keyBetween: no key below the smallest');
    return res;
  }
  if (b === null) {
    const ia = integerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia);
    return i === undefined ? ia + midpoint(fa, '') : i;
  }
  const ia = integerPart(a);
  const fa = a.slice(ia.length);
  const ib = integerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb);
  const i = incrementInteger(ia);
  if (i === undefined) throw new Error('keyBetween: no key above the largest');
  if (i < b) return i;
  return ia + midpoint(fa, '');
}

/** `count` keys strictly between `a` and `b`, spread so none becomes needlessly long. */
export function keysBetween(a: string | null, b: string | null, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [keyBetween(a, b)];
  if (b === null) {
    // Appending: step the integer part so keys stay short.
    let last = keyBetween(a, null);
    const out = [last];
    for (let i = 1; i < count; i++) {
      last = keyBetween(last, null);
      out.push(last);
    }
    return out;
  }
  if (a === null) {
    let first = keyBetween(null, b);
    const out = [first];
    for (let i = 1; i < count; i++) {
      first = keyBetween(null, first);
      out.unshift(first);
    }
    return out;
  }
  const midIndex = Math.floor(count / 2);
  const mid = keyBetween(a, b);
  return [...keysBetween(a, mid, midIndex), mid, ...keysBetween(mid, b, count - midIndex - 1)];
}

export function isValidKey(key: unknown): key is string {
  if (typeof key !== 'string' || key.length === 0) return false;
  try {
    validate(key);
    return true;
  } catch {
    return false;
  }
}

/** Comparator for (key, id) pairs: by key, then id, so equal keys still order deterministically. */
export function compareKeyed(a: { key: string; id: string }, b: { key: string; id: string }): number {
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Given the desired order of ids and their current keys (missing or invalid
 * allowed), return the smallest set of new keys that makes the keys sort in
 * that order. Keeps a longest increasing subsequence of the existing keys and
 * places every other item between its kept neighbours.
 */
export function assignKeys(order: readonly string[], keys: ReadonlyMap<string, string>): Map<string, string> {
  const n = order.length;
  const current = order.map((id) => {
    const k = keys.get(id);
    return isValidKey(k) ? k : null;
  });
  // Longest strictly increasing subsequence over items that have a key.
  const tails: number[] = [];
  const prev: number[] = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const k = current[i];
    if (k === null) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (current[tails[mid]]! < k) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i !== -1; i = prev[i]) keep.add(i);

  const out = new Map<string, string>();
  const resolved: (string | null)[] = current.map((k, i) => (keep.has(i) ? k : null));
  let i = 0;
  while (i < n) {
    if (resolved[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && resolved[j] === null) j++;
    const lower = i > 0 ? resolved[i - 1] : null;
    const upper = j < n ? resolved[j] : null;
    const fresh = keysBetween(lower, upper, j - i);
    for (let k = i; k < j; k++) {
      resolved[k] = fresh[k - i];
      out.set(order[k], fresh[k - i]);
    }
    i = j;
  }
  return out;
}

// ---- internals -------------------------------------------------------------

function midpoint(a: string, b: string): string {
  if (b !== '' && a >= b) throw new Error(`midpoint: ${a} is not below ${b}`);
  if (a.endsWith('0') || b.endsWith('0')) throw new Error('midpoint: fractions must not end in 0');
  if (b !== '') {
    let n = 0;
    while (n < a.length && a[n] === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a === '' ? 0 : DIGITS.indexOf(a[0]);
  const digitB = b === '' ? BASE : DIGITS.indexOf(b[0]);
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)];
  if (b.length > 1) return b[0];
  return DIGITS[digitA] + midpoint(a.slice(1), '');
}

function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid key head ${head}`);
}

function integerPart(key: string): string {
  const len = integerLength(key[0]);
  if (len > key.length) throw new Error(`invalid key ${key}`);
  return key.slice(0, len);
}

function validate(key: string): void {
  const ip = integerPart(key);
  const frac = key.slice(ip.length);
  if (frac.endsWith('0')) throw new Error(`invalid key ${key}`);
  for (const ch of key) if (!DIGITS.includes(ch)) throw new Error(`invalid key ${key}`);
}

function incrementInteger(x: string): string | undefined {
  const head = x[0];
  const digs = x.slice(1).split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]) + 1;
    if (d === BASE) digs[i] = '0';
    else {
      digs[i] = DIGITS[d];
      carry = false;
    }
  }
  if (!carry) return head + digs.join('');
  if (head === 'Z') return 'a0';
  if (head === 'z') return undefined;
  const h = String.fromCharCode(head.charCodeAt(0) + 1);
  if (h > 'a') digs.push('0');
  else digs.pop();
  return h + digs.join('');
}

function decrementInteger(x: string): string | undefined {
  const head = x[0];
  const digs = x.slice(1).split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digs[i]) - 1;
    if (d === -1) digs[i] = DIGITS[BASE - 1];
    else {
      digs[i] = DIGITS[d];
      borrow = false;
    }
  }
  if (!borrow) return head + digs.join('');
  if (head === 'a') return 'Z' + DIGITS[BASE - 1];
  if (head === 'A') return undefined;
  const h = String.fromCharCode(head.charCodeAt(0) - 1);
  if (h < 'Z') digs.push(DIGITS[BASE - 1]);
  else digs.pop();
  return h + digs.join('');
}
