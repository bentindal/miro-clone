export interface DividerProps {
  orientation?: 'vertical' | 'horizontal';
}

/** A hairline between groups of controls. Decorative, so hidden from assistive technology. */
export function Divider({ orientation = 'vertical' }: DividerProps) {
  return <span className="ui-divider" data-orientation={orientation} aria-hidden="true" />;
}
