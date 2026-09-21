/**
 * Inline formatting for the text on a shape, as ranges over the plain string
 * rather than a tree.
 *
 * This is deliberately the small version. A range model cannot nest or carry
 * block structure, and it is not trying to: what it buys is that `text` stays
 * a plain string, so every existing thing that reads it — wrapping, fitting,
 * hit testing, search, the accessible description, the board file — keeps
 * working unchanged, and formatting is one more property that rides along. A
 * document model would replace all of that at once. If nesting is ever
 * wanted, a tree can be built over these ranges; nothing here has to be
 * thrown away first.
 */

export const MARK_KINDS = ['bold', 'italic', 'link'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

export interface Mark {
  kind: MarkKind;
  /** Character offsets into the shape's `text`, half-open: `[from, to)`. */
  from: number;
  to: number;
  /** Where a link goes. Empty for the other kinds. */
  href: string;
}

/** A run of characters that all carry the same formatting. */
export interface TextRun {
  text: string;
  /** Offset of the run's first character in the whole string. */
  start: number;
  bold: boolean;
  italic: boolean;
  /** Non-empty when the run is a link. */
  href: string;
}

const same = (a: Mark, b: Mark) => a.kind === b.kind && a.href === b.href;

/**
 * Sorted, clamped, with empty ranges dropped and touching ranges of the same
 * kind joined. Every function here returns marks in this shape, so two equal
 * sets of formatting are equal as data and a round trip cannot drift.
 */
export function normalizeMarks(marks: readonly Mark[], length = Number.MAX_SAFE_INTEGER): Mark[] {
  const clean = marks
    .map((m) => ({ kind: m.kind, href: m.href ?? '', from: Math.max(0, Math.min(m.from, length)), to: Math.max(0, Math.min(m.to, length)) }))
    .filter((m) => m.to > m.from)
    .sort((a, b) => a.from - b.from || a.to - b.to || a.kind.localeCompare(b.kind));

  const out: Mark[] = [];
  for (const m of clean) {
    const last = out.find((o) => same(o, m) && o.to >= m.from && o.from <= m.to);
    if (last) {
      last.from = Math.min(last.from, m.from);
      last.to = Math.max(last.to, m.to);
    } else out.push({ ...m });
  }
  return out.sort((a, b) => a.from - b.from || a.kind.localeCompare(b.kind));
}

/** Whether every character in `[from, to)` carries `kind`. */
export function hasMarkOver(marks: readonly Mark[], kind: MarkKind, from: number, to: number): boolean {
  if (to <= from) return false;
  let at = from;
  for (const m of normalizeMarks(marks).filter((m) => m.kind === kind)) {
    if (m.from > at) return false;
    at = Math.max(at, m.to);
    if (at >= to) return true;
  }
  return at >= to;
}

/** Take `kind` off every character in `[from, to)`, splitting any mark that straddles it. */
export function removeMark(marks: readonly Mark[], kind: MarkKind, from: number, to: number): Mark[] {
  const out: Mark[] = [];
  for (const m of marks) {
    if (m.kind !== kind || m.to <= from || m.from >= to) {
      out.push({ ...m });
      continue;
    }
    if (m.from < from) out.push({ ...m, to: from });
    if (m.to > to) out.push({ ...m, from: to });
  }
  return normalizeMarks(out);
}

/**
 * Turn `kind` on over `[from, to)`, or off if it is already on throughout.
 * That is what a toggle button has to mean: pressing it on a selection that
 * is already bold must un-bold it, not make it bold twice.
 */
export function toggleMark(marks: readonly Mark[], kind: MarkKind, from: number, to: number, href = ''): Mark[] {
  if (to <= from) return normalizeMarks(marks);
  if (hasMarkOver(marks, kind, from, to) && (kind !== 'link' || linkAt(marks, from) === href || href === '')) {
    return removeMark(marks, kind, from, to);
  }
  // A link's target replaces whatever was there, rather than layering.
  const base = kind === 'link' ? removeMark(marks, kind, from, to) : [...marks];
  return normalizeMarks([...base, { kind, from, to, href }]);
}

/** The link on the character at `index`, or an empty string. */
export function linkAt(marks: readonly Mark[], index: number): string {
  for (const m of marks) if (m.kind === 'link' && index >= m.from && index < m.to) return m.href;
  return '';
}

export interface TextChange {
  /** Where the change starts. */
  at: number;
  /** How many characters were taken out. */
  removed: number;
  /** How many were put in. */
  inserted: number;
}

/**
 * The single replaced range between two strings, found from the common
 * prefix and suffix. A textarea hands over the whole new value and nothing
 * about what changed, and this is enough to keep the marks lined up for the
 * edits people actually make: typing, deleting, and pasting over a selection.
 */
export function diffText(before: string, after: string): TextChange {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let end = 0;
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { at: start, removed: before.length - start - end, inserted: after.length - start - end };
}

/**
 * Move marks to follow a text change.
 *
 * A pure insertion at the very end of a mark extends it and one at the very
 * start does not, so typing on from a bold word stays bold while typing up to
 * one does not become bold. The two are symmetric in the data and only a
 * caret-level "pending format" could tell them apart properly; this picks the
 * side people notice.
 */
export function remapMarks(marks: readonly Mark[], change: TextChange, length: number): Mark[] {
  const { at, removed, inserted } = change;
  const delta = inserted - removed;
  const out: Mark[] = [];
  for (const m of marks) {
    let from: number;
    let to: number;
    if (removed === 0) {
      from = at <= m.from ? m.from + inserted : m.from;
      to = at > m.from && at <= m.to ? m.to + inserted : at <= m.from ? m.to + inserted : m.to;
    } else {
      const map = (o: number) => (o <= at ? o : o >= at + removed ? o + delta : at);
      from = map(m.from);
      to = map(m.to);
    }
    out.push({ ...m, from, to });
  }
  return normalizeMarks(out, length);
}

/**
 * `[from, to)` split into runs that each carry one set of formatting, in
 * order and covering the range exactly. The renderer draws a run at a time,
 * so this is where "which font" is decided once rather than per character.
 */
export function runsFor(text: string, marks: readonly Mark[], from = 0, to = text.length): TextRun[] {
  const lo = Math.max(0, from);
  const hi = Math.min(text.length, to);
  if (hi <= lo) return [];
  const edges = new Set<number>([lo, hi]);
  for (const m of marks) {
    if (m.from > lo && m.from < hi) edges.add(m.from);
    if (m.to > lo && m.to < hi) edges.add(m.to);
  }
  const points = [...edges].sort((a, b) => a - b);
  const runs: TextRun[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const covers = (kind: MarkKind) => marks.some((m) => m.kind === kind && m.from <= start && m.to >= end);
    const link = marks.find((m) => m.kind === 'link' && m.from <= start && m.to >= end);
    const run: TextRun = { text: text.slice(start, end), start, bold: covers('bold'), italic: covers('italic'), href: link?.href ?? '' };
    // Neighbours that look the same are one run, so the renderer never splits
    // a word for no reason and measurement stays stable.
    const last = runs[runs.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) last.text += run.text;
    else runs.push(run);
  }
  return runs;
}
