import { Button, type ButtonProps } from './Button';
import type { IconName } from './Icon';

export interface IconButtonProps extends Omit<ButtonProps, 'icon' | 'children' | 'aria-label'> {
  icon: IconName;
  /** Required: an icon alone has no accessible name. */
  label: string;
}

/** A square button whose only content is an icon. */
export function IconButton({ icon, label, ...rest }: IconButtonProps) {
  return <Button icon={icon} aria-label={label} {...rest} />;
}
