import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Opens the player sheet by adding ?p=<id>, so Back closes it. */
export function useOpenPlayer(): (id: number) => void {
  const [, setParams] = useSearchParams();
  return useCallback((id: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('p', String(id));
      return next;
    });
  }, [setParams]);
}
