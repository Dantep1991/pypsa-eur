import { useLayoutEffect, useRef } from 'react';

// Geometry-derived markers, pies and zone boundaries belong to the same frame
// as its lines. A failed/superseded drawing must not publish half a network.
// Store only the last committed frame, not a history of large feature arrays.
export function useCommittedMapFrame(candidate, ready) {
  const committed = useRef(null);
  useLayoutEffect(() => { if (ready) committed.current = candidate; }, [candidate, ready]);
  return ready ? candidate : committed.current;
}
