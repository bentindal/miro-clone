import { useEffect, useState } from 'react';
import type { Shape } from '../model/types';
import { Button, type IconName, IconButton, Panel, Select, Swatch, useMeasure } from '../ui';
import type { Editor } from './Editor';
import { type Field, type FieldKey, type StylePatch, fieldsFor, shapesFor, valueOf } from './fields';
import { useEditorVersion } from './useEditor';

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
 * Floating toolbar above the selection. Its contents are not written here:
 * `fields.ts` declares which properties each shape type has, and this renders
 * whichever of them the selection brings, in the order they are declared.
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
  const topLevel = editor.scene.normalizeSelection(editor.selection);
  const canAlign = topLevel.length >= 2;
  const canDistribute = topLevel.length >= 3;

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

  return (
    <div ref={measure} className="property-bar" data-testid="property-bar" role="toolbar" aria-label="Properties" style={{ left, top }} onPointerDown={(e) => e.stopPropagation()}>
      {groupFields(leaves).map(([group, fields]) => (
        <div key={group} className="prop-group" aria-label={group}>
          {fields.map((field) => (
            <FieldControl key={field.key} field={field} shapes={shapesFor(field, leaves)} editor={editor} />
          ))}
        </div>
      ))}
      {canAlign && (
        <div className="prop-group" aria-label="Arrange">
          {ALIGNMENTS.map((a) => (
            <IconButton key={a.kind} size="sm" icon={a.icon} label={a.label} keepFocus data-testid={`prop-align-${a.kind}`} onClick={() => editor.align(a.kind)} />
          ))}
          <IconButton size="sm" icon="distributeX" label="Distribute horizontally" keepFocus data-testid="prop-distribute-x" disabled={!canDistribute} onClick={() => editor.distribute('x')} />
          <IconButton size="sm" icon="distributeY" label="Distribute vertically" keepFocus data-testid="prop-distribute-y" disabled={!canDistribute} onClick={() => editor.distribute('y')} />
        </div>
      )}
      <div className="prop-group prop-menu" aria-label="Order">
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

type Keyed = Field & { key: FieldKey };

/** Fields the selection brings, bundled into the groups they declare. */
function groupFields(leaves: readonly Shape[]): [string, Keyed[]][] {
  const out: [string, Keyed[]][] = [];
  for (const field of fieldsFor(leaves)) {
    if (field.kind === 'text' && field.singleOnly && shapesFor(field, leaves).length !== 1) continue;
    const last = out[out.length - 1];
    if (last && last[0] === field.group) last[1].push(field);
    else out.push([field.group, [field]]);
  }
  return out;
}

/**
 * One control, chosen by the field's kind. Where the shapes it applies to
 * disagree, the value is `undefined` and the control shows as indeterminate
 * rather than claiming the first shape's value speaks for all of them.
 */
function FieldControl({ field, shapes, editor }: { field: Keyed; shapes: Shape[]; editor: Editor }) {
  const apply = (value: unknown) => editor.setStyle({ [field.key]: value } as StylePatch);

  if (field.kind === 'action') {
    return (
      <Button size="sm" icon={field.icon} toggle="outline" active={field.active(shapes)} keepFocus data-testid={`prop-${field.id}`} onClick={() => field.run(editor)}>
        {field.text(shapes)}
      </Button>
    );
  }

  const { value, mixed } = valueOf(field, shapes);
  const optionLabel = field.optionLabel as ((v: unknown) => string) | undefined;

  switch (field.kind) {
    case 'color': {
      const palette = field.palette(shapes);
      // With no swatches the picker is the whole control, so it takes the
      // field's own name rather than a `-custom` suffix.
      const customId = palette.length > 0 ? `prop-${field.id}-custom` : `prop-${field.id}`;
      return (
        <>
          {field.label && <span className="prop-label">{field.label}</span>}
          {palette.map((c) => (
            <Swatch
              key={c}
              color={c}
              label={optionLabel ? optionLabel(c) : c}
              active={value === c}
              keepFocus
              data-testid={`prop-${field.id}-swatch`}
              data-color={c}
              onClick={() => apply(c)}
            />
          ))}
          {field.custom && (
            <input
              className="ui-color"
              type="color"
              data-testid={customId}
              data-mixed={mixed || undefined}
              aria-label={field.a11y}
              value={typeof value === 'string' ? value : '#ffffff'}
              onChange={(e) => apply(e.target.value)}
            />
          )}
        </>
      );
    }
    case 'number':
      if (field.as === 'weight') {
        return (
          <>
            {field.label && <span className="prop-label">{field.label}</span>}
            {field.options.map((w) => (
              <Button
                key={w}
                size="sm"
                toggle="outline"
                active={value === w}
                keepFocus
                aria-label={optionLabel ? optionLabel(w) : String(w)}
                data-testid={`prop-${field.id}-${w}`}
                onClick={() => apply(w)}
              >
                <span className="stroke-width-bar" style={{ height: w }} />
              </Button>
            ))}
          </>
        );
      }
      return (
        <>
          {field.label && <span className="prop-label">{field.label}</span>}
          <Select data-testid={`prop-${field.id}`} aria-label={field.a11y} value={value as number | undefined} options={field.options} onValueChange={(v) => apply(Number(v))} />
        </>
      );
    case 'enum': {
      const optionIcon = field.optionIcon as ((v: unknown) => IconName) | undefined;
      if (field.as === 'buttons') {
        return (
          <>
            {field.label && <span className="prop-label">{field.label}</span>}
            {field.options.map((o) =>
              optionIcon ? (
                <IconButton
                  key={o}
                  size="sm"
                  icon={optionIcon(o)}
                  label={optionLabel ? optionLabel(o) : o}
                  toggle="outline"
                  active={value === o}
                  keepFocus
                  data-testid={`prop-${field.id}-${o}`}
                  onClick={() => apply(o)}
                />
              ) : (
                <Button key={o} size="sm" toggle="outline" active={value === o} keepFocus data-testid={`prop-${field.id}-${o}`} onClick={() => apply(o)}>
                  {o}
                </Button>
              ),
            )}
          </>
        );
      }
      return (
        <>
          {field.label && <span className="prop-label">{field.label}</span>}
          <Select data-testid={`prop-${field.id}`} aria-label={field.a11y} value={value as string | undefined} options={field.options} onValueChange={(v) => apply(v)} />
        </>
      );
    }
    case 'text':
      return (
        <input
          className="ui-input label-input"
          data-testid={`prop-${field.id}`}
          aria-label={field.a11y}
          placeholder={field.placeholder}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => apply(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
        />
      );
  }
}
