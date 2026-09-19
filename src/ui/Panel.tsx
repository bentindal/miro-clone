import type { HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Row across the top, above a hairline. */
  header?: ReactNode;
  elevation?: 'md' | 'lg';
  children?: ReactNode;
}

/** A raised surface: the comments panel, the share popover, anything that floats. */
export function Panel({ header, elevation = 'lg', className, children, ...rest }: PanelProps) {
  return (
    <div className={className ? `ui-panel ${className}` : 'ui-panel'} data-elevation={elevation} {...rest}>
      {header && <header className="ui-panel-header">{header}</header>}
      {children}
    </div>
  );
}
