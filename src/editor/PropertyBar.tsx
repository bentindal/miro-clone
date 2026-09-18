import { ANCHORS, CONNECTOR_STYLES, type Anchor, type ConnectorStyle, type Shape } from '../model/types';
import type { Editor, StylePatch } from './Editor';
import { useEditorVersion } from './useEditor';

export const PALETTE = ['#ffffff', '#222222', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#a5d6a7', '#90caf9'];
export const STICKY_PALETTE = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1', '#ce93d8', '#ffffff'];
const WIDTHS = [1, 2, 4, 8];
const FONT_SIZES = [12, 14, 18, 24, 32, 48];

const BAR_WIDTH = 520;
const BAR_HEIGHT = 44;

/**
 * Floating toolbar above the selection for editing the properties of the
 * selected objects: fill, stroke, stroke width, font size, connector style
 * and anchors. Only controls relevant to the selection are shown.
 */
export function PropertyBar({ editor }: { editor: Editor }) {
  useEditorVersion(editor);
  if (editor.tool !== 'select' || editor.selection.length === 0 || editor.isDragging || editor.editing) return null;
  const frame = editor.selectionFrame;
  if (!frame) return null;

  const leaves: Shape[] = [];
  for (const id of editor.selection) for (const leaf of editor.scene.leaves(id)) leaves.push(editor.scene.mustGet(leaf));
  const fillable = leaves.filter((s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'sticky');
  const strokable = leaves.filter((s) => s.type === 'rect' || s.type === 'ellipse' || s.type === 'line' || s.type === 'pen' || s.type === 'connector');
  const texts = leaves.filter((s) => s.type === 'text');
  const connectors = leaves.filter((s) => s.type === 'connector');
  if (fillable.length + strokable.length + texts.length + connectors.length === 0) return null;

  const onlyStickies = fillable.length > 0 && fillable.every((s) => s.type === 'sticky');
  const fillPalette = onlyStickies ? STICKY_PALETTE : PALETTE;
  const currentFill = fillable.length ? (fillable[0] as { fill: string }).fill : undefined;
  const currentStroke = strokable.length ? (strokable[0] as { stroke: string }).stroke : undefined;
  const currentWidth = strokable.length ? (strokable[0] as { strokeWidth: number }).strokeWidth : undefined;
  const currentFont = texts.length ? (texts[0] as { fontSize: number }).fontSize : undefined;
  const currentStyle = connectors.length ? (connectors[0] as { style: ConnectorStyle }).style : undefined;
  const startAnchor = connectors.length ? (connectors[0] as { start: { anchor: Anchor } }).start.anchor : undefined;
  const endAnchor = connectors.length ? (connectors[0] as { end: { anchor: Anchor } }).end.anchor : undefined;

  const hs = Object.values(frame.handles);
  const minX = Math.min(...hs.map((h) => h.x));
  const minY = Math.min(...hs.map((h) => h.y));
  const maxY = Math.max(...hs.map((h) => h.y));
  const left = Math.max(8, Math.min(minX, editor.viewport.w - BAR_WIDTH - 8));
  const above = minY - BAR_HEIGHT - 16;
  const top = above >= 8 ? above : Math.min(maxY + 16, editor.viewport.h - BAR_HEIGHT - 8);

  const apply = (patch: StylePatch) => editor.setStyle(patch);
  const noFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="property-bar" data-testid="property-bar" role="toolbar" aria-label="Properties" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {fillable.length > 0 && (
        <div className="prop-group" aria-label="Fill">
          <span className="prop-label">Fill</span>
          {fillPalette.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${currentFill === c ? ' active' : ''}`}
              style={{ background: c }}
              title={`Fill ${c}`}
              aria-label={`Fill ${c}`}
              data-testid="prop-fill-swatch"
              data-color={c}
              onMouseDown={noFocus}
              onClick={() => apply({ fill: c })}
            />
          ))}
          <input type="color" data-testid="prop-fill-custom" aria-label="Custom fill" value={currentFill ?? '#ffffff'} onChange={(e) => apply({ fill: e.target.value })} />
        </div>
      )}
      {strokable.length > 0 && (
        <div className="prop-group" aria-label="Stroke">
          <span className="prop-label">Stroke</span>
          {PALETTE.slice(0, 8).map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch${currentStroke === c ? ' active' : ''}`}
              style={{ background: c }}
              title={`Stroke ${c}`}
              aria-label={`Stroke ${c}`}
              data-testid="prop-stroke-swatch"
              data-color={c}
              onMouseDown={noFocus}
              onClick={() => apply({ stroke: c })}
            />
          ))}
          <input type="color" data-testid="prop-stroke-custom" aria-label="Custom stroke" value={currentStroke ?? '#222222'} onChange={(e) => apply({ stroke: e.target.value })} />
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={`width${currentWidth === w ? ' active' : ''}`}
              title={`Stroke width ${w}`}
              aria-label={`Stroke width ${w}`}
              aria-pressed={currentWidth === w}
              data-testid={`prop-width-${w}`}
              onMouseDown={noFocus}
              onClick={() => apply({ strokeWidth: w })}
            >
              <span style={{ height: w, background: '#222', display: 'block', width: 16 }} />
            </button>
          ))}
        </div>
      )}
      {texts.length > 0 && (
        <div className="prop-group" aria-label="Text">
          <span className="prop-label">Size</span>
          <select data-testid="prop-font-size" aria-label="Font size" value={currentFont} onChange={(e) => apply({ fontSize: Number(e.target.value) })}>
            {FONT_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <input type="color" data-testid="prop-text-color" aria-label="Text colour" value={(texts[0] as { color: string }).color} onChange={(e) => apply({ color: e.target.value })} />
        </div>
      )}
      {connectors.length > 0 && (
        <div className="prop-group" aria-label="Connector">
          {CONNECTOR_STYLES.map((st) => (
            <button
              key={st}
              type="button"
              className={currentStyle === st ? 'active' : ''}
              aria-pressed={currentStyle === st}
              data-testid={`prop-connector-${st}`}
              onMouseDown={noFocus}
              onClick={() => apply({ connectorStyle: st })}
            >
              {st}
            </button>
          ))}
          <span className="prop-label">From</span>
          <select data-testid="prop-anchor-start" aria-label="Start anchor" value={startAnchor} onChange={(e) => apply({ startAnchor: e.target.value as Anchor })}>
            {ANCHORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <span className="prop-label">To</span>
          <select data-testid="prop-anchor-end" aria-label="End anchor" value={endAnchor} onChange={(e) => apply({ endAnchor: e.target.value as Anchor })}>
            {ANCHORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
