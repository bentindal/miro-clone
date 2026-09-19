import type { SelectHTMLAttributes } from 'react';

export interface SelectProps<T extends string | number> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'children'> {
  /** `undefined` means indeterminate: the selection does not agree on one value. */
  value: T | undefined;
  options: readonly T[];
  onValueChange: (value: string) => void;
  /** Text for each option; defaults to the value itself. */
  labelFor?: (value: T) => string;
  /** Shown while the value is indeterminate. */
  placeholder?: string;
}

export function Select<T extends string | number>({ value, options, onValueChange, labelFor, placeholder = 'Mixed', className, ...rest }: SelectProps<T>) {
  const indeterminate = value === undefined;
  return (
    <select
      className={className ? `ui-select ${className}` : 'ui-select'}
      value={indeterminate ? '' : value}
      data-mixed={indeterminate || undefined}
      onChange={(e) => onValueChange(e.target.value)}
      {...rest}
    >
      {indeterminate && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o} value={o}>
          {labelFor ? labelFor(o) : o}
        </option>
      ))}
    </select>
  );
}
