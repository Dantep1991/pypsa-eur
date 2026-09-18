import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const EMPTY = { type: 'FeatureCollection', features: [], meta: {} };
export const GRID_ACCESS_TIMEOUT_MS = 30_000;

// A queue snapshot belongs to its exact query, not just its record count.
// Never display the previous country's/metric's records under new controls.
export function useGridAccessRecords({ url, enabled, recoveryKey, onRecovered }) {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const recovered = useRef(onRecovered);
  useLayoutEffect(() => { recovered.current = onRecovered; }, [onRecovered]);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) { setSnapshot(null); return undefined; }
    const controller = new AbortController();
    let disposed = false;
    const publish = (next) => {
      if (!disposed) setSnapshot({ url, revision, recoveryKey, ...next });
    };
    publish({ loading: true, error: '', data: EMPTY });
    const timer = setTimeout(() => {
      controller.abort();
      publish({ loading: false, error: 'Grid-access request timed out. Please retry.', data: EMPTY });
    }, GRID_ACCESS_TIMEOUT_MS);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error('Could not load grid-access records. Please retry.');
        if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
          throw new Error('Grid-access service returned an invalid map response. Please retry.');
        }
        return payload;
      })
      .then((data) => {
        if (disposed || controller.signal.aborted) return;
        publish({ loading: false, error: '', data });
        recovered.current?.();
      })
      .catch((error) => {
        if (disposed || controller.signal.aborted) return;
        publish({ loading: false, error: error instanceof SyntaxError
          ? 'Grid-access service returned an invalid map response. Please retry.'
          : 'Could not load grid-access records. Please retry.', data: EMPTY });
      })
      .finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [url, enabled, revision, recoveryKey]);

  const current = enabled && snapshot?.url === url && snapshot.revision === revision
    && snapshot.recoveryKey === recoveryKey;
  return {
    data: current ? snapshot.data : EMPTY,
    loading: Boolean(enabled && (!current || snapshot.loading)),
    error: current ? snapshot.error : '', retry,
  };
}
