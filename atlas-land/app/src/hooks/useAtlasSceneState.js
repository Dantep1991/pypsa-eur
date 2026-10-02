import { useCallback, useLayoutEffect, useRef } from 'react';

// Values are immutable React state. Retaining references avoids cloning large
// networks. The caller bounds the history; restores never write source files.
export default function useAtlasSceneState(bindings, busy, beforeRestore) {
  const latest = useRef({ bindings, busy, beforeRestore });
  useLayoutEffect(() => { latest.current = { bindings, busy, beforeRestore }; });
  const capture = useCallback(() => Object.fromEntries(
    Object.entries(latest.current.bindings).map(([key, [value]]) => [key, value]),
  ), []);
  const restore = useCallback((snapshot) => {
    if (latest.current.busy) throw new Error('Wait for the current Atlas update to finish.');
    latest.current.beforeRestore?.(snapshot);
    for (const [key, [, setter]] of Object.entries(latest.current.bindings)) {
      if (Object.prototype.hasOwnProperty.call(snapshot, key)) setter(snapshot[key]);
    }
  }, []);
  return { capture, restore };
}
