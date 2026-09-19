import type { SelectHTMLAttributes } from 'react';

export interface SelectProps<T extends string | number> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'children'> {
  value: T | undefined;
  options: readonly T[];
  onValueChange: (value: string) => void;
  /** Text for each option; defaults to the value itself. */
  labelFor?: (value: T) => string;
}

export function Select<T extends string | number>({ value, options, onValueChange, labelFor, className, ...rest }: SelectProps<T>) {
  return (
    <select className={className ? `ui-select ${className}` : 'ui-select'} value={value} onChange={(e) => onValueChange(e.target.value)} {...rest}>
      {options.map((o) => (
        <option key={o} value={o}>
          {labelFor ? labelFor(o) : o}
        </option>
      ))}
    </select>
  );
}
