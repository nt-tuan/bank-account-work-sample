import { useSyncExternalStore } from 'react';

/**
 * Hide-amounts device preference (docs/technical-design/features/accounts.md): a non-sensitive boolean in localStorage,
 * the only browser-storage value. Reads and writes fall back to "shown" when storage is unavailable.
 */
const KEY = 'demo-banking:hide-amounts';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let hidden = read();

function write(value: boolean) {
  hidden = value;
  try {
    localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* fall back to memory */
  }
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      hidden = read();
      listeners.forEach((l) => l());
    }
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useAmountsHidden(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false,
  );
  return [value, write];
}
