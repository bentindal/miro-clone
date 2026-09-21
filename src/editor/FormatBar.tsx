import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Panel } from '../ui';
import type { MarkKind } from '../model/marks';
import type { Editor } from './Editor';

/** Only these ever reach a link, so a board cannot smuggle in a script. */
const SAFE_LINK = /^(https?:|mailto:)/i;

/** What a person types when they mean a web address. */
function asHref(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  if (SAFE_LINK.test(text)) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  // No scheme at all is far more often a website than a typo, and https is
  // the safer of the two guesses.
  return /^[\w-]+(\.[\w-]+)+/.test(text) ? `https://${text}` : '';
}

export interface FormatBarProps {
  editor: Editor;
  /** So the text editor can tell "focus moved into the bar" from "focus left". */
  barRef: React.RefObject<HTMLDivElement | null>;
  /** Where the bar sits, in board coordinates. */
  at: { x: number; y: number };
  /** The highlighted range in the text being edited. */
  range: { from: number; to: number };
  /** Put the caret back where it was, since a button took focus. */
  restore: () => void;
}

/**
 * Bold, italic, a link and the list style, over whatever is highlighted in
 * the text being edited. It is its own bar rather than part of the property
 * bar because it acts on a range inside one shape, not on the selection: the
 * property bar has no idea what is highlighted and should not have to.
 */
export function FormatBar({ editor, barRef, at, range, restore }: FormatBarProps) {
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const empty = range.to <= range.from;

  useEffect(() => {
    if (linking) inputRef.current?.focus();
  }, [linking]);

  // A bar opened for one highlighted range has no business staying open for
  // the next one.
  useEffect(() => setLinking(false), [range.from, range.to]);

  const apply = (kind: MarkKind) => {
    editor.applyMark(kind, range.from, range.to);
    restore();
  };

  const commitLink = () => {
    const url = asHref(href);
    setLinking(false);
    setHref('');
    if (url) editor.applyMark('link', range.from, range.to, url);
    restore();
  };

  const existing = editor.linkOver(range.from, range.to);

  return (
    <Panel
      ref={barRef}
      className="format-bar"
      data-testid="format-bar"
      role="toolbar"
      aria-label="Formatting"
      elevation="md"
      style={{ left: at.x, top: at.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <IconButton
        size="sm"
        icon="bold"
        label="Bold"
        toggle="outline"
        keepFocus
        data-testid="format-bold"
        disabled={empty}
        active={!empty && editor.markedOver('bold', range.from, range.to)}
        onClick={() => apply('bold')}
      />
      <IconButton
        size="sm"
        icon="italic"
        label="Italic"
        toggle="outline"
        keepFocus
        data-testid="format-italic"
        disabled={empty}
        active={!empty && editor.markedOver('italic', range.from, range.to)}
        onClick={() => apply('italic')}
      />
      <IconButton
        size="sm"
        icon="link"
        label={existing ? 'Remove link' : 'Add link'}
        toggle="outline"
        keepFocus
        data-testid="format-link"
        disabled={empty}
        active={Boolean(existing)}
        onClick={() => {
          // A second press on something already linked takes the link off,
          // rather than asking for a URL nobody wanted to change.
          if (existing) apply('link');
          else setLinking((l) => !l);
        }}
      />
      {linking && (
        <span className="format-link-row">
          <input
            ref={inputRef}
            className="ui-input link-input"
            data-testid="format-link-url"
            aria-label="Link address"
            placeholder="example.com"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                commitLink();
                e.preventDefault();
              } else if (e.key === 'Escape') {
                setLinking(false);
                restore();
                e.preventDefault();
              }
            }}
          />
          <Button size="sm" keepFocus data-testid="format-link-apply" onClick={commitLink}>
            Link
          </Button>
        </span>
      )}
    </Panel>
  );
}
