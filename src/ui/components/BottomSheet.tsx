import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Slide-up panel on phones, centered dialog on larger screens. Closes on
 * backdrop tap or Escape.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade-in absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="animate-sheet-up pb-safe relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl md:max-w-xl md:rounded-3xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line md:hidden" />
        <button onClick={onClose} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2" aria-label="Close">
          <Icon name="close" />
        </button>
        <div className="overflow-y-auto px-4 pb-6 pt-3 md:px-6">{children}</div>
      </div>
    </div>
  );
}
