import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;
const LiveRegionContext = createContext<Announce>(() => undefined);

/** One polite live region for status changes and submission progress (spec §5). */
export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const announce = useCallback<Announce>((m) => {
    setMessage('');
    window.clearTimeout(timer.current);
    // Clearing first makes screen readers re-announce an identical message.
    timer.current = window.setTimeout(() => setMessage(m), 50);
  }, []);
  return (
    <LiveRegionContext.Provider value={announce}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </LiveRegionContext.Provider>
  );
}

export const useAnnounce = () => useContext(LiveRegionContext);
