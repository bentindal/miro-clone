import { Button, type ButtonProps } from './Button';

export interface SwatchProps extends Omit<ButtonProps, 'icon' | 'children' | 'style' | 'aria-label'> {
  color: string;
  /** Required: the colour is not an accessible name. */
  label: string;
}

/** A round colour chip. Selected state is a ring, so the colour stays readable. */
export function Swatch({ color, label, className, ...rest }: SwatchProps) {
  return (
    <Button
      className={className ? `ui-swatch ${className}` : 'ui-swatch'}
      toggle="outline"
      size="sm"
      style={{ background: color }}
      aria-label={label}
      {...rest}
    />
  );
}
