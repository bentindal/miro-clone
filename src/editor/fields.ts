import {
  ANCHORS,
  ARROW_HEADS,
  CONNECTOR_STYLES,
  TEXT_ALIGNS,
  TEXT_VALIGNS,
  type Anchor,
  type ArrowHead,
  type ConnectorStyle,
  type ConnectorShape,
  type Shape,
  type ShapeType,
  type StickyShape,
  type TextAlign,
  type TextVAlign,
} from '../model/types';
import type { IconName } from '../ui';
import { loadUser } from '../sync/session';
import type { Editor } from './Editor';

export const PALETTE = ['#ffffff', '#222222', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#a5d6a7', '#90caf9'];
export const STICKY_PALETTE = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#f48fb1', '#ce93d8', '#ffffff'];
const WIDTHS = [1, 2, 4, 8];
const FONT_SIZES = [12, 14, 18, 24, 32, 48];

interface FieldCommon {
  /** Identity in the DOM: controls are `prop-<id>`, or `prop-<id>-<value>`. */
  id: string;
  /** Heading the control sits under, and the group it shares with its neighbours. */
  group: string;
  /** Shown before the control. Omitted where the control speaks for itself. */
  label?: string;
  /** Accessible name of the control itself, where its own content is not one. */
  a11y?: string;
  /** Accessible name of one option's control, for fields rendered as a row. */
  optionLabel?: (value: never) => string;
  /** Icon for one option's button, where a word would be worse than a picture. */
  optionIcon?: (value: never) => IconName;
  /** Shape types that have this property. Anything else ignores the field. */
  types: readonly ShapeType[];
}

/**
 * `read` and `write` are declared as methods on purpose: method parameters are
 * bivariant, so a field over a narrow value type (`ConnectorStyle`) is still
 * assignable to the renderer's `Field` union.
 */
export interface ColorField extends FieldCommon {
  kind: 'color';
  /** Swatches offered, which may depend on what is selected. */
  palette(shapes: readonly Shape[]): readonly string[];
  /** A free colour picker beside the swatches. */
  custom: boolean;
  read(s: Shape): string;
  write(v: string, s: Shape): Partial<Shape>;
}

export interface EnumField<V extends string = string> extends FieldCommon {
  kind: 'enum';
  options: readonly V[];
  /** One button per option, rather than a dropdown. */
  as: 'buttons' | 'select';
  read(s: Shape): V;
  write(v: V, s: Shape): Partial<Shape>;
}

export interface NumberField extends FieldCommon {
  kind: 'number';
  options: readonly number[];
  /** `weight` draws each option as a bar of that thickness. */
  as: 'weight' | 'select';
  read(s: Shape): number;
  write(v: number, s: Shape): Partial<Shape>;
}

export interface TextField extends FieldCommon {
  kind: 'text';
  placeholder: string;
  /** Editing text across several shapes at once means nothing, so ask for one. */
  singleOnly: boolean;
  read(s: Shape): string;
  write(v: string, s: Shape): Partial<Shape>;
}

/** A button rather than a value: it does something to the shapes it applies to. */
export interface ActionField extends FieldCommon {
  kind: 'action';
  icon?: IconName;
  text(shapes: readonly Shape[]): string;
  active(shapes: readonly Shape[]): boolean;
  run(editor: Editor): void;
}

export type Field = ColorField | EnumField | NumberField | TextField | ActionField;

const FILLABLE = ['rect', 'ellipse', 'sticky'] as const;
const STROKABLE = ['rect', 'ellipse', 'line', 'pen', 'connector'] as const;

/**
 * Every editable property in one table, keyed by the name it takes in a
 * `StylePatch`. The property bar renders from this and `Editor.setStyle`
 * applies from it, so adding a property is the shape type, the serialiser and
 * one entry here.
 */
export const FIELDS = {
  fill: {
    kind: 'color',
    id: 'fill',
    group: 'Fill',
    label: 'Fill',
    types: FILLABLE,
    // Sticky notes get paper colours, but only when nothing else is selected.
    palette: (shapes) => (shapes.length > 0 && shapes.every((s) => s.type === 'sticky') ? STICKY_PALETTE : PALETTE),
    custom: true,
    a11y: 'Custom fill',
    optionLabel: (c: string) => `Fill ${c}`,
    read: (s) => (s as { fill: string }).fill,
    write: (v) => ({ fill: v }) as Partial<Shape>,
  } satisfies ColorField,


  vote: {
    kind: 'action',
    id: 'vote',
    group: 'Votes',
    types: ['sticky'],
    text: (shapes) => {
      const votes = shapes.reduce((n, s) => n + (s as StickyShape).votes.length, 0);
      const voted = isVoted(shapes);
      return `${voted ? 'Voted' : 'Vote'}${votes > 0 ? ` · ${votes}` : ''}`;
    },
    active: (shapes) => isVoted(shapes),
    run: (editor) => editor.toggleVote(loadUser().name),
  } satisfies ActionField,

  stroke: {
    kind: 'color',
    id: 'stroke',
    group: 'Stroke',
    label: 'Stroke',
    types: STROKABLE,
    palette: () => PALETTE.slice(0, 8),
    custom: true,
    a11y: 'Custom stroke',
    optionLabel: (c: string) => `Stroke ${c}`,
    read: (s) => (s as { stroke: string }).stroke,
    write: (v) => ({ stroke: v }) as Partial<Shape>,
  } satisfies ColorField,

  strokeWidth: {
    kind: 'number',
    id: 'width',
    group: 'Stroke',
    types: STROKABLE,
    options: WIDTHS,
    as: 'weight',
    optionLabel: (w: number) => `Stroke width ${w}`,
    read: (s) => (s as { strokeWidth: number }).strokeWidth,
    write: (v) => ({ strokeWidth: v }) as Partial<Shape>,
  } satisfies NumberField,

  fontSize: {
    kind: 'number',
    id: 'font-size',
    group: 'Text',
    label: 'Size',
    types: ['text'],
    options: FONT_SIZES,
    as: 'select',
    a11y: 'Font size',
    read: (s) => (s as { fontSize: number }).fontSize,
    write: (v) => ({ fontSize: v }) as Partial<Shape>,
  } satisfies NumberField,

  color: {
    kind: 'color',
    id: 'text-color',
    group: 'Text',
    types: ['text'],
    palette: () => [],
    custom: true,
    a11y: 'Text colour',
    read: (s) => (s as { color: string }).color,
    write: (v) => ({ color: v }) as Partial<Shape>,
  } satisfies ColorField,


  align: {
    kind: 'enum',
    id: 'align',
    group: 'Text',
    label: 'Align',
    types: ['sticky'],
    options: TEXT_ALIGNS,
    as: 'buttons',
    optionLabel: (a: TextAlign) => `Align text ${a === 'center' ? 'centre' : a}`,
    optionIcon: (a: TextAlign) => (a === 'left' ? 'textLeft' : a === 'right' ? 'textRight' : 'textCenter'),
    read: (s) => (s as StickyShape).align,
    write: (v) => ({ align: v }) as Partial<Shape>,
  } satisfies EnumField<TextAlign>,

  valign: {
    kind: 'enum',
    id: 'valign',
    group: 'Text',
    types: ['sticky'],
    options: TEXT_VALIGNS,
    as: 'buttons',
    optionLabel: (a: TextVAlign) => `Align text to the ${a}`,
    optionIcon: (a: TextVAlign) => (a === 'top' ? 'textTop' : a === 'bottom' ? 'textBottom' : 'textMiddle'),
    read: (s) => (s as StickyShape).valign,
    write: (v) => ({ valign: v }) as Partial<Shape>,
  } satisfies EnumField<TextVAlign>,

  connectorStyle: {
    kind: 'enum',
    id: 'connector',
    group: 'Connector',
    types: ['connector'],
    options: CONNECTOR_STYLES,
    as: 'buttons',
    read: (s) => (s as ConnectorShape).style,
    write: (v) => ({ style: v }) as Partial<Shape>,
  } satisfies EnumField<ConnectorStyle>,

  startAnchor: {
    kind: 'enum',
    id: 'anchor-start',
    group: 'Connector',
    label: 'From',
    a11y: 'Start anchor',
    types: ['connector'],
    options: ANCHORS,
    as: 'select',
    read: (s) => (s as ConnectorShape).start.anchor,
    write: (v, s) => ({ start: { ...(s as ConnectorShape).start, anchor: v } }) as Partial<Shape>,
  } satisfies EnumField<Anchor>,

  endAnchor: {
    kind: 'enum',
    id: 'anchor-end',
    group: 'Connector',
    label: 'To',
    a11y: 'End anchor',
    types: ['connector'],
    options: ANCHORS,
    as: 'select',
    read: (s) => (s as ConnectorShape).end.anchor,
    write: (v, s) => ({ end: { ...(s as ConnectorShape).end, anchor: v } }) as Partial<Shape>,
  } satisfies EnumField<Anchor>,

  startArrow: {
    kind: 'enum',
    id: 'arrow-start',
    group: 'Connector',
    label: 'Heads',
    a11y: 'Start arrowhead',
    types: ['connector'],
    options: ARROW_HEADS,
    as: 'select',
    read: (s) => (s as ConnectorShape).startArrow,
    write: (v) => ({ startArrow: v }) as Partial<Shape>,
  } satisfies EnumField<ArrowHead>,

  endArrow: {
    kind: 'enum',
    id: 'arrow-end',
    group: 'Connector',
    a11y: 'End arrowhead',
    types: ['connector'],
    options: ARROW_HEADS,
    as: 'select',
    read: (s) => (s as ConnectorShape).endArrow,
    write: (v) => ({ endArrow: v }) as Partial<Shape>,
  } satisfies EnumField<ArrowHead>,

  label: {
    kind: 'text',
    id: 'label',
    group: 'Connector',
    types: ['connector'],
    placeholder: 'Label',
    a11y: 'Connector label',
    singleOnly: true,
    read: (s) => (s as ConnectorShape).label,
    write: (v) => ({ label: v }) as Partial<Shape>,
  } satisfies TextField,
} as const;

function isVoted(shapes: readonly Shape[]): boolean {
  const voter = loadUser().name;
  return shapes.length > 0 && shapes.every((s) => (s as StickyShape).votes.includes(voter));
}

export type FieldKey = keyof typeof FIELDS;

/** In the order the bar renders them. */
export const FIELD_LIST: readonly (Field & { key: FieldKey })[] = (Object.keys(FIELDS) as FieldKey[]).map((key) => ({ ...(FIELDS[key] as Field), key }));

type ValueOf<F> = F extends { read(s: Shape): infer V } ? V : never;

/**
 * Derived from the table, so a property the bar can edit is a property
 * `setStyle` accepts, by construction.
 */
export type StylePatch = { [K in FieldKey]?: ValueOf<(typeof FIELDS)[K]> };

/** Fields that apply to at least one of these shapes, in table order. */
export function fieldsFor(shapes: readonly Shape[]): (Field & { key: FieldKey })[] {
  return FIELD_LIST.filter((f) => shapes.some((s) => f.types.includes(s.type)));
}

/** The shapes a field applies to. */
export function shapesFor(field: Field, shapes: readonly Shape[]): Shape[] {
  return shapes.filter((s) => field.types.includes(s.type));
}

/**
 * Apply one field's value to a shape. The value comes from a `StylePatch`, so
 * it is already the type of the field it is keyed under; this is the one place
 * that fact is asserted rather than proved.
 */
export function applyField(field: Field, value: unknown, s: Shape): Partial<Shape> {
  if (field.kind === 'action') return {};
  return (field.write as (v: unknown, shape: Shape) => Partial<Shape>)(value, s);
}

/**
 * The changes a patch makes to one shape: every field the patch names that
 * this shape type has. Empty when the patch says nothing about it.
 */
export function patchFor(shape: Shape, patch: StylePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of FIELD_LIST) {
    const value = patch[field.key];
    if (value === undefined || !field.types.includes(shape.type)) continue;
    Object.assign(out, applyField(field, value, shape));
  }
  return out;
}

export interface FieldValue {
  /** The shared value, or undefined when the shapes disagree. */
  value: unknown;
  /** True when the shapes disagree, so no control should claim a value. */
  mixed: boolean;
}

/**
 * What a field currently reads across the shapes it applies to. Showing the
 * first shape's value for a selection that disagrees is a lie the control then
 * writes back on the next click, so disagreement is its own state.
 */
export function valueOf(field: Field, shapes: readonly Shape[]): FieldValue {
  if (field.kind === 'action') return { value: undefined, mixed: false };
  const read = field.read as (s: Shape) => unknown;
  const values = new Set(shapes.map(read));
  return values.size === 1 ? { value: [...values][0], mixed: false } : { value: undefined, mixed: values.size > 1 };
}
