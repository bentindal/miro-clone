import type { ReactNode } from 'react';

/**
 * One inline SVG set for the whole editor. Icons inherit `currentColor` and
 * the stroke weight from `.ui-icon`, so a button's variant styles its icon
 * without the icon knowing anything about the button.
 */
const GLYPHS = {
  select: <path d="M6 3v16.5l3.9-4.2 2.4 5.4 2.6-1.2-2.4-5.3H18z" />,
  hand: (
    <>
      <path d="M9 11V5.6a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.6a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V6.6a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.7a5 5 0 0 1-4.1-2.2L5 14.6a1.6 1.6 0 0 1 2.6-1.9L9 14.4V11" />
    </>
  ),
  rect: <rect x="3.5" y="6" width="17" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  line: <path d="M5 19 19 5" />,
  sticky: (
    <>
      <path d="M5 4.5h14V14l-5 5.5H5z" />
      <path d="M19 14h-5v5.5" />
    </>
  ),
  text: <path d="M6 6h12M12 6v12M9.5 18h5" />,
  pen: (
    <>
      <path d="m4 20 1.3-4.3L15.4 5.6a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.3 18.7z" />
      <path d="m14.2 6.8 3 3" />
    </>
  ),
  connector: (
    <>
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="5.5" r="2.5" />
      <path d="M7.3 16.7 16.7 7.3" />
    </>
  ),
  frame: <path d="M7.5 3v14.5H22M2 7.5h14.5V22" />,
  comment: (
    <>
      <path d="M20 11.5c0 3.6-3.6 6.5-8 6.5a10 10 0 0 1-2.3-.3L5 19.5l1.2-3A6.2 6.2 0 0 1 4 11.5C4 7.9 7.6 5 12 5s8 2.9 8 6.5z" />
    </>
  ),
  undo: (
    <>
      <path d="M4.5 9H14a5 5 0 0 1 0 10H8" />
      <path d="m4.5 9 4-4M4.5 9l4 4" />
    </>
  ),
  redo: (
    <>
      <path d="M19.5 9H10a5 5 0 0 0 0 10h6" />
      <path d="m19.5 9-4-4M19.5 9l-4 4" />
    </>
  ),
  trash: <path d="M4 7h16M10 4.5h4M6.5 7l.9 12.5h9.2L17.5 7M10 11v5.5M14 11v5.5" />,
  group: (
    <>
      <path d="M3 7.5V3h4.5M16.5 3H21v4.5M21 16.5V21h-4.5M7.5 21H3v-4.5" />
      <rect x="7.5" y="7.5" width="9" height="9" rx="1" />
    </>
  ),
  ungroup: (
    <>
      <rect x="3" y="3" width="9" height="9" rx="1" />
      <rect x="12" y="12" width="9" height="9" rx="1" />
    </>
  ),
  forward: (
    <>
      <rect x="3.5" y="10" width="10" height="10" rx="1" />
      <path d="M18 20v-9m0 0-3 3m3-3 3 3" />
    </>
  ),
  backward: (
    <>
      <rect x="3.5" y="4" width="10" height="10" rx="1" />
      <path d="M18 4v9m0 0-3-3m3 3 3-3" />
    </>
  ),
  front: (
    <>
      <rect x="3.5" y="10" width="10" height="10" rx="1" />
      <path d="M18 20v-8m0 0-3 3m3-3 3 3M15 5h6" />
    </>
  ),
  back: (
    <>
      <rect x="3.5" y="4" width="10" height="10" rx="1" />
      <path d="M18 4v8m0 0-3-3m3 3 3-3M15 19h6" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20M7.5 10.5h6M10.5 7.5v6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20M7.5 10.5h6" />
    </>
  ),
  fit: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  grid: <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />,
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m4 16.5 4.5-4.5 3.5 3.5 3-2.5 5 4" />
    </>
  ),
  save: <path d="M12 3v10m0 0-3.5-3.5M12 13l3.5-3.5M4.5 16v4h15v-4" />,
  load: <path d="M12 13V3m0 0L8.5 6.5M12 3l3.5 3.5M4.5 16v4h15v-4" />,
  share: (
    <>
      <circle cx="6.5" cy="12" r="2.5" />
      <circle cx="17.5" cy="6" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="m8.7 10.8 6.6-3.6M8.7 13.2l6.6 3.6" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
  check: <path d="m5 13 4.5 4.5L19 7" />,
  textLeft: <path d="M4 5.5h16M4 10h10M4 14.5h16M4 19h10" />,
  textCenter: <path d="M4 5.5h16M7 10h10M4 14.5h16M7 19h10" />,
  textRight: <path d="M4 5.5h16M10 10h10M4 14.5h16M10 19h10" />,
  textTop: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M7 7.5h10M7 11h6" />
    </>
  ),
  textMiddle: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M7 10.5h10M7 14h6" />
    </>
  ),
  textBottom: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M7 13.5h10M7 17h6" />
    </>
  ),
  alignLeft: <path d="M4 3v18M7.5 7.5h10M7.5 16.5h6" />,
  alignCenterX: <path d="M12 3v18M7 7.5h10M9 16.5h6" />,
  alignRight: <path d="M20 3v18M6.5 7.5h10M10.5 16.5h6" />,
  alignTop: <path d="M3 4h18M7.5 7.5v10M16.5 7.5v6" />,
  alignCenterY: <path d="M3 12h18M7.5 7v10M16.5 9v6" />,
  alignBottom: <path d="M3 20h18M7.5 6.5v10M16.5 10.5v6" />,
  distributeX: (
    <>
      <path d="M4 3v18M20 3v18" />
      <rect x="9.5" y="8" width="5" height="8" rx="1" />
    </>
  ),
  distributeY: (
    <>
      <path d="M3 4h18M3 20h18" />
      <rect x="8" y="9.5" width="8" height="5" rx="1" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  cut: (
    <>
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="18" r="2.5" />
      <path d="M8.3 16.2 18 3M15.7 16.2 6 3" />
    </>
  ),
  paste: (
    <>
      <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="2.5" width="6" height="4" rx="1" />
    </>
  ),
  duplicate: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 4H5.5A1.5 1.5 0 0 0 4 5.5V15" />
      <path d="M11.5 14.5h6M14.5 11.5v6" />
    </>
  ),
  selectAll: (
    <>
      <path d="M3 7.5V5.5A2.5 2.5 0 0 1 5.5 3h2M16.5 3h2A2.5 2.5 0 0 1 21 5.5v2M21 16.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M7.5 21h-2A2.5 2.5 0 0 1 3 18.5v-2" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </>
  ),
  command: (
    <>
      <path d="M9 9h6v6H9z" />
      <path d="M9 9V7.5a2.5 2.5 0 1 0-2.5 2.5H9M15 9V7.5A2.5 2.5 0 1 1 17.5 10H15M9 15v1.5A2.5 2.5 0 1 1 6.5 14H9M15 15v1.5a2.5 2.5 0 1 0 2.5-2.5H15" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M8 15h8" />
    </>
  ),
  bold: <path d="M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7zM7 12h6.8a3.75 3.75 0 0 1 0 7.5H7z" />,
  italic: <path d="M14.5 4.5h-4M13.5 19.5h-4M14 4.5l-3.5 15" />,
  link: (
    <>
      <path d="M10 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1.2 1.2" />
      <path d="M14 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1.2-1.2" />
    </>
  ),
  listBullet: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.75" cy="6.5" r="1.3" />
      <circle cx="4.75" cy="12" r="1.3" />
      <circle cx="4.75" cy="17.5" r="1.3" />
    </>
  ),
  listNumber: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M3.2 4.6 4.6 4v4M3 16.3a1.5 1.5 0 1 1 2.6 1L3 19.4h2.8" />
    </>
  ),
  minimap: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <rect x="6" y="7.5" width="8" height="6" rx="1" />
    </>
  ),
  reset: (
    <>
      <path d="M4 5.5v5h5" />
      <path d="M4.6 14a8 8 0 1 0 .8-5.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

export const ICON_NAMES = Object.keys(GLYPHS) as IconName[];

export interface IconProps {
  name: IconName;
  /** Edge length in pixels. */
  size?: number;
  className?: string;
}

/**
 * Icons are decoration: the control around them carries the accessible name,
 * so they are hidden from assistive technology.
 */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {GLYPHS[name]}
    </svg>
  );
}
