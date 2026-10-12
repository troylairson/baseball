import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Sheets are driven by a query param (?p=12, ?g=40) so the Back button closes them. */
function useParamOpener(key: string): (id: number) => void {
  const [, setParams] = useSearchParams();
  return useCallback((id: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, String(id));
      return next;
    });
  }, [key, setParams]);
}

export const useOpenPlayer = () => useParamOpener('p');
export const useOpenGame = () => useParamOpener('g');
