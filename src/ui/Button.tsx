import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'default' | 'primary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. A button with an icon and no label renders square. */
  icon?: IconName;
  /**
   * Toggle state. When given, the button also reports `aria-pressed`; leave it
   * undefined for a button that simply performs an action.
   */
  active?: boolean;
  /** How an active button reads. Use `outline` where the control carries its own colour. */
  toggle?: 'fill' | 'outline';
  /**
   * Keep focus where it is on mouse down. The board's keyboard shortcuts only
   * reach it while it holds focus, so bar buttons never steal it.
   */
  keepFocus?: boolean;
  children?: ReactNode;
}

/** The only button in the project. Everything else is a variant of it. */
export function Button({
  variant = 'default',
  size = 'md',
  icon,
  active,
  toggle = 'fill',
  keepFocus = false,
  className,
  children,
  onMouseDown,
  ...rest
}: ButtonProps) {
  const iconOnly = icon !== undefined && (children === undefined || children === null || children === false);
  const classes = ['ui-button'];
  if (iconOnly) classes.push('ui-icon-button');
  if (className) classes.push(className);
  return (
    <button
      type="button"
      className={classes.join(' ')}
      data-variant={variant}
      data-size={size}
      data-active={active === undefined ? undefined : active}
      data-toggle={toggle}
      aria-pressed={active}
      onMouseDown={(e) => {
        if (keepFocus) e.preventDefault();
        onMouseDown?.(e);
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 18} />}
      {children}
    </button>
  );
}
