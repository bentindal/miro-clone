import { useEffect, useState } from 'react';
import { ANCHORS, ARROW_HEADS, CONNECTOR_STYLES, type Anchor, type ArrowHead, type ConnectorStyle, type Shape } from '../model/types';
import type { Editor, StylePatch } from './Editor';
import { useEditorVersion } from './useEditor';
import { loadUser } from '../sync/session';
import { Button, type IconName, IconButton, Panel, Select, Swatch, useMeasure } from '../ui';

export const PALETTE = ['#ffffff', '#222222', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#a5d6a7', '#90caf9'];
export const STICKY_PALETTE = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1', '#ce93d8', '#ffffff'];
const WIDTHS = [1, 2, 4, 8];
const FONT_SIZES = [12, 14, 18, 24, 32, 48];

const ALIGNMENTS: { kind: 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'; label: string; icon: IconName }[] = [
  { kind: 'left', label: 'Align left', icon: 'alignLeft' },
  { kind: 'centerX', label: 'Align horizontal centres', icon: 'alignCenterX' },
  { kind: 'right', label: 'Align right', icon: 'alignRight' },
  { kind: 'top', label: 'Align top', icon: 'alignTop' },
  { kind: 'centerY', label: 'Align vertical centres', icon: 'alignCenterY' },
  { kind: 'bottom', label: 'Align bottom', icon: 'alignBottom' },
];

/** Arranging the selection: no longer a permanent strip at the top of the app. */
const ARRANGE: { id: string; label: string; icon: IconName; run: (e: Editor) => void; enabled: (e: Editor) => boolean }[] = [
  { id: 'group', label: 'Group', icon: 'group', run: (e) => e.groupSelection(), enabled: (e) => e.selection.length >= 2 },
  { id: 'ungroup', label: 'Ungroup', icon: 'ungroup', run: (e) => e.ungroupSelection(), enabled: (e) => e.selection.some((id) => e.scene.get(id)?.type === 'group') },
  { id: 'bring-forward', label: 'Bring forward', icon: 'forward', run: (e) => e.bringForward(), enabled: () => true },
  { id: 'send-backward', label: 'Send backward', icon: 'backward', run: (e) => e.sendBackward(), enabled: () => true },
  { id: 'bring-to-front', label: 'Bring to front', icon: 'front', run: (e) => e.bringToFront(), enabled: () => true },
  { id: 'send-to-back', label: 'Send to back', icon: 'back', run: (e) => e.sendToBack(), enabled: () => true },
  { id: 'delete', label: 'Delete', icon: 'trash', run: (e) => e.deleteSelection(), enabled: () => true },
];

/** First-render estimate only; the bar measures itself once it is on screen. */
const BAR_WIDTH = 520;
const BAR_HEIGHT = 44;
/** Gap between the bar and the selection, and the viewport edge. */
const BAR_GAP = 16;
const BAR_MARGIN = 8;

/**
 * Floating toolbar above the selection for editing the properties of the
 * selected objects: fill, stroke, stroke width, font size, connector style
 * and anchors. Only controls relevant to the selection are shown.
 */
export function PropertyBar({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  // The bar's width changes with the selection, so measure it rather than
  // guessing; a guess that is too small lets it run off the right edge.
  const [measure, size] = useMeasure({ w: BAR_WIDTH, h: BAR_HEIGHT });
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const selectionKey = editor.selection.join(',');
  // A menu opened for one selection has no business staying open for the next.
  useEffect(() => setArrangeOpen(false), [selectionKey]);
  useEffect(() => {
    if (!arrangeOpen) return;
    // The bar stops pointer events from reaching this listener, so it only
    // fires for clicks outside the bar.
    const close = () => setArrangeOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [arrangeOpen]);
  if (editor.readOnly || editor.tool !== 'select' || editor.selection.length === 0 || editor.isDragging || editor.editing) return null;
  const frame = editor.selectionFrame;
  if (!frame) return null;

  const leaves: Shape[] = [];
  for (const id of editor.selection) for (const leaf of editor.scene.leaves(id)) leaves.push(editor.scene.mustGet(leaf));
  const fillable = leaves.filter((s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'sticky');
  const strokable = leaves.filter((s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'line' || s.type === 'pen' || s.type === 'connector');
  const texts = leaves.filter((s) => s.type === 'text');
  const connectors = leaves.filter((s) => s.type === 'connector');
  const topLevel = editor.scene.normalizeSelection(editor.selection);
  const canAlign = topLevel.length >= 2;
  const canDistribute = topLevel.length >= 3;

  const stickies = leaves.filter((s) => s.type === 'sticky');
  const onlyStickies = fillable.length > 0 && fillable.every((s) => s.type === 'sticky');
  const voter = loadUser().name;
  const voted = stickies.length > 0 && stickies.every((s) => (s as { votes: string[] }).votes.includes(voter));
  const voteCount = stickies.reduce((n, s) => n + (s as { votes: string[] }).votes.length, 0);
  const fillPalette = onlyStickies ? STICKY_PALETTE : PALETTE;
  const currentFill = fillable.length ? (fillable[0] as { fill: string }).fill : undefined;
  const currentStroke = strokable.length ? (strokable[0] as { stroke: string }).stroke : undefined;
  const currentWidth = strokable.length ? (strokable[0] as { strokeWidth: number }).strokeWidth : undefined;
  const currentFont = texts.length ? (texts[0] as { fontSize: number }).fontSize : undefined;
  const currentStyle = connectors.length ? (connectors[0] as { style: ConnectorStyle }).style : undefined;
  const startAnchor = connectors.length ? (connectors[0] as { start: { anchor: Anchor } }).start.anchor : undefined;
  const endAnchor = connectors.length ? (connectors[0] as { end: { anchor: Anchor } }).end.anchor : undefined;
  const startArrow = connectors.length ? (connectors[0] as { startArrow: ArrowHead }).startArrow : undefined;
  const endArrow = connectors.length ? (connectors[0] as { endArrow: ArrowHead }).endArrow : undefined;
  const label = connectors.length === 1 ? (connectors[0] as { label: string }).label : '';

  const hs = Object.values(frame.handles);
  const minX = Math.min(...hs.map((h) => h.x));
  const minY = Math.min(...hs.map((h) => h.y));
  const maxY = Math.max(...hs.map((h) => h.y));
  // Stay clear of the rail on the left and the dock on the right.
  const minLeft = editor.insets.left + BAR_MARGIN;
  const maxLeft = editor.viewport.w - editor.insets.right - size.w - BAR_MARGIN;
  const left = maxLeft < minLeft ? minLeft : Math.max(minLeft, Math.min(minX, maxLeft));
  const above = minY - size.h - BAR_GAP;
  const top = above >= BAR_MARGIN ? above : Math.min(maxY + BAR_GAP, editor.viewport.h - size.h - BAR_MARGIN);

  const apply = (patch: StylePatch) => editor.setStyle(patch);

  return (
    <div ref={measure} className="property-bar" data-testid="property-bar" role="toolbar" aria-label="Properties" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {fillable.length > 0 && (
        <div className="prop-group" aria-label="Fill">
          <span className="prop-label">Fill</span>
          {fillPalette.map((c) => (
            <Swatch key={c} color={c} label={`Fill ${c}`} active={currentFill === c} keepFocus data-testid="prop-fill-swatch" data-color={c} onClick={() => apply({ fill: c })} />
          ))}
          <input className="ui-color" type="color" data-testid="prop-fill-custom" aria-label="Custom fill" value={currentFill ?? '#ffffff'} onChange={(e) => apply({ fill: e.target.value })} />
        </div>
      )}
      {stickies.length > 0 && (
        <div className="prop-group" aria-label="Votes">
          <Button
            size="sm"
            icon={voted ? 'check' : undefined}
            toggle="outline"
            active={voted}
            keepFocus
            data-testid="prop-vote"
            title={voted ? 'Remove your vote' : 'Vote for this note'}
            onClick={() => editor.toggleVote(voter)}
          >
            {voted ? 'Voted' : 'Vote'}
            {voteCount > 0 ? ` · ${voteCount}` : ''}
          </Button>
        </div>
      )}
      {strokable.length > 0 && (
        <div className="prop-group" aria-label="Stroke">
          <span className="prop-label">Stroke</span>
          {PALETTE.slice(0, 8).map((c) => (
            <Swatch key={c} color={c} label={`Stroke ${c}`} active={currentStroke === c} keepFocus data-testid="prop-stroke-swatch" data-color={c} onClick={() => apply({ stroke: c })} />
          ))}
          <input className="ui-color" type="color" data-testid="prop-stroke-custom" aria-label="Custom stroke" value={currentStroke ?? '#222222'} onChange={(e) => apply({ stroke: e.target.value })} />
          {WIDTHS.map((w) => (
            <Button
              key={w}
              size="sm"
              toggle="outline"
              active={currentWidth === w}
              keepFocus
              aria-label={`Stroke width ${w}`}
              data-testid={`prop-width-${w}`}
              onClick={() => apply({ strokeWidth: w })}
            >
              <span className="stroke-width-bar" style={{ height: w }} />
            </Button>
          ))}
        </div>
      )}
      {texts.length > 0 && (
        <div className="prop-group" aria-label="Text">
          <span className="prop-label">Size</span>
          <Select data-testid="prop-font-size" aria-label="Font size" value={currentFont} options={FONT_SIZES} onValueChange={(v) => apply({ fontSize: Number(v) })} />
          <input
            className="ui-color"
            type="color"
            data-testid="prop-text-color"
            aria-label="Text colour"
            value={(texts[0] as { color: string }).color}
            onChange={(e) => apply({ color: e.target.value })}
          />
        </div>
      )}
      {canAlign && (
        <div className="prop-group" aria-label="Arrange">
          {ALIGNMENTS.map((a) => (
            <IconButton key={a.kind} size="sm" icon={a.icon} label={a.label} keepFocus data-testid={`prop-align-${a.kind}`} onClick={() => editor.align(a.kind)} />
          ))}
          <IconButton
            size="sm"
            icon="distributeX"
            label="Distribute horizontally"
            keepFocus
            data-testid="prop-distribute-x"
            disabled={!canDistribute}
            onClick={() => editor.distribute('x')}
          />
          <IconButton
            size="sm"
            icon="distributeY"
            label="Distribute vertically"
            keepFocus
            data-testid="prop-distribute-y"
            disabled={!canDistribute}
            onClick={() => editor.distribute('y')}
          />
        </div>
      )}
      {connectors.length > 0 && (
        <div className="prop-group" aria-label="Connector">
          {CONNECTOR_STYLES.map((st) => (
            <Button key={st} size="sm" toggle="outline" active={currentStyle === st} keepFocus data-testid={`prop-connector-${st}`} onClick={() => apply({ connectorStyle: st })}>
              {st}
            </Button>
          ))}
          <span className="prop-label">From</span>
          <Select data-testid="prop-anchor-start" aria-label="Start anchor" value={startAnchor} options={ANCHORS} onValueChange={(v) => apply({ startAnchor: v as Anchor })} />
          <span className="prop-label">To</span>
          <Select data-testid="prop-anchor-end" aria-label="End anchor" value={endAnchor} options={ANCHORS} onValueChange={(v) => apply({ endAnchor: v as Anchor })} />
          <span className="prop-label">Heads</span>
          <Select data-testid="prop-arrow-start" aria-label="Start arrowhead" value={startArrow} options={ARROW_HEADS} onValueChange={(v) => apply({ startArrow: v as ArrowHead })} />
          <Select data-testid="prop-arrow-end" aria-label="End arrowhead" value={endArrow} options={ARROW_HEADS} onValueChange={(v) => apply({ endArrow: v as ArrowHead })} />
          {connectors.length === 1 && (
            <input
              className="ui-input label-input"
              data-testid="prop-label"
              aria-label="Connector label"
              placeholder="Label"
              value={label}
              onChange={(e) => apply({ label: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
            />
          )}
        </div>
      )}
      <div className="prop-group prop-menu" aria-label="Arrange">
        <IconButton
          size="sm"
          icon="more"
          label="Arrange"
          keepFocus
          data-action="arrange-menu"
          aria-expanded={arrangeOpen}
          active={arrangeOpen}
          toggle="outline"
          onClick={() => setArrangeOpen((o) => !o)}
        />
        {arrangeOpen && (
          <Panel className="prop-menu-panel" data-testid="arrange-menu" role="menu">
            {ARRANGE.map((a) => (
              <Button
                key={a.id}
                size="sm"
                variant="ghost"
                icon={a.icon}
                role="menuitem"
                keepFocus
                data-action={a.id}
                disabled={!a.enabled(editor)}
                onClick={() => {
                  a.run(editor);
                  setArrangeOpen(false);
                }}
              >
                {a.label}
              </Button>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
