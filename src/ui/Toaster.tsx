import { useSyncExternalStore } from 'react';
import { IconButton } from './IconButton';
import { toasts } from './toast';

/** Where messages appear. One per app, above everything else. */
export function Toaster() {
  const list = useSyncExternalStore(toasts.subscribe, toasts.list, toasts.list);
  if (list.length === 0) return null;
  return (
    <div className="toaster" role="status" aria-live="polite" data-testid="toaster">
      {list.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} data-testid="toast">
          <span className="toast-text">{t.message}</span>
          <IconButton icon="close" label="Dismiss" variant="ghost" size="sm" onClick={() => toasts.dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}
