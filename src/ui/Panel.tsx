import { type HTMLAttributes, type ReactNode, type Ref } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  /** Row across the top, above a hairline. */
  header?: ReactNode;
  elevation?: 'md' | 'lg';
  children?: ReactNode;
  /** For the callers that have to measure or position the panel themselves. */
  ref?: Ref<HTMLDivElement>;
}

/** A raised surface: the comments panel, the share popover, anything that floats. */
export function Panel({ header, elevation = 'lg', className, children, ref, ...rest }: PanelProps) {
  return (
    <div ref={ref} className={className ? `ui-panel ${className}` : 'ui-panel'} data-elevation={elevation} {...rest}>
      {header && <header className="ui-panel-header">{header}</header>}
      {children}
    </div>
  );
}
