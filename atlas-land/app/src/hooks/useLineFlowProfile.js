import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';

export const FLOW_PROFILE_TIMEOUT_MS = 30_000;

export function useLineFlowProfile({ dirname, name, type, granularityPrefix, timeView }) {
  const [snapshot, setSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  const key = JSON.stringify([dirname, name, type || 'line', granularityPrefix, timeView, revision]);
  const enabled = Boolean(dirname && name);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let disposed = false;
    const publish = state => { if (!disposed) setSnapshot({ key, ...state }); };
    publish({ loading: true, data: null, error: '' });
    const timer = setTimeout(() => {
      controller.abort();
      publish({ loading: false, data: null, error: 'Flow profile request timed out. Please retry.' });
    }, FLOW_PROFILE_TIMEOUT_MS);
    const params = new URLSearchParams({ dirname, name, type: type || 'line', view: timeView,
      ...(granularityPrefix ? { granularity_prefix: granularityPrefix } : {}) });
    fetch(`${API_BASE_URL}/api/pypsa/line-flow-profile?${params}`, { signal: controller.signal })
      .then(async response => {
        if (disposed || controller.signal.aborted) return null;
        // The existing service uses 404 for an unsolved/missing flow series.
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Flow profile unavailable');
        const data = await response.json();
        if (disposed || controller.signal.aborted) return null;
        if (!data || typeof data !== 'object' || Array.isArray(data)
          || ['p0', 'p1'].some(end => data[end] != null && (!Array.isArray(data[end].data)
            || data[end].data.some(point => !point || !Number.isFinite(point.value))))) {
          throw new Error('Invalid flow profile');
        }
        return data;
      })
      .then(data => {
        if (!disposed && !controller.signal.aborted) publish({ loading: false, data, error: '' });
      })
      .catch(() => {
        if (!disposed && !controller.signal.aborted) publish({ loading: false, data: null,
          error: 'Could not load the flow profile. Please retry.' });
      })
      .finally(() => clearTimeout(timer));
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [key, enabled, dirname, name, type, granularityPrefix, timeView]);
  // Hide the old asset/period on the first render, before the effect resets it.
  const current = enabled && snapshot?.key === key;
  return { data: current ? snapshot.data : null, error: current ? snapshot.error : '',
    loading: enabled && (!current || snapshot.loading), retry };
}
