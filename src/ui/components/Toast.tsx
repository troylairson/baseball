import { useEffect } from 'react';
import { useGame } from '../../state/game';

/** Bottom toast for action feedback; sits above the mobile tab bar. */
export function Toast() {
  const toast = useGame((s) => s.toast);
  const show = useGame((s) => s.showToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => show(null), 3500);
    return () => clearTimeout(t);
  }, [toast, show]);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 md:bottom-8" role="status" aria-live="polite">
      <div className="animate-fade-in pointer-events-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-bg shadow-xl">{toast}</div>
    </div>
  );
}
