import { useCallback } from 'react';
const EMPTY = Object.freeze([]);

// Apply updater functions against the latest store, not a render's captured
// message array. Context is explicit so late callbacks cannot target another tab.
export function useContextMessages(store, setStore, context) {
  const setMessages = useCallback(updater => {
    setStore(previous => ({ ...previous, [context]: typeof updater === 'function'
      ? updater(previous[context] || EMPTY) : updater }));
  }, [setStore, context]);
  return [store[context] || EMPTY, setMessages];
}
