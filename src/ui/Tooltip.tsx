import type { ReactNode } from 'react';

export interface TooltipProps {
  /** Shown in the bubble. The control itself still carries the accessible name. */
  label: string;
  /** Keyboard shortcut, shown as a key cap. */
  shortcut?: string;
  placement?: 'top' | 'bottom';
  children: ReactNode;
}

/**
 * Hover and focus hint. The bubble is decorative and does not take pointer
 * events, so it never sits between the pointer and the canvas.
 */
export function Tooltip({ label, shortcut, placement = 'bottom', children }: TooltipProps) {
  return (
    <span className="ui-tooltip-anchor" data-placement={placement}>
      {children}
      <span className="ui-tooltip" aria-hidden="true">
        {label}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </span>
  );
}
