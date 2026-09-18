import { useEffect, useLayoutEffect, useRef } from 'react';

// Fetch lightweight service metadata only while its overlay is active. An
// inactive optional layer must be a true zero-cost feature at startup; once
// activated, the latest successful signature is retained so reopening an
// unchanged overlay does not republish metadata or rerender the map.
export function useVisibleServicePoll({ url, active, onData, onUnavailable,
  intervalMs = 60_000, retryMs = 5_000, timeoutMs = 10_000 }) {
  const callbacks = useRef({ onData, onUnavailable });
  const previous = useRef({ url: null, signature: '' });
  useLayoutEffect(() => { callbacks.current = { onData, onUnavailable }; }, [onData, onUnavailable]);

  useEffect(() => {
    if (previous.current.url !== url) previous.current = { url, signature: '' };
    let disposed = false;
    let timer;
    let request;
    let failures = 0;
    const visible = () => document.visibilityState !== 'hidden';
    const cancel = () => {
      clearTimeout(timer);
      if (request) {
        request.finished = true;
        clearTimeout(request.timeout);
        request.controller.abort();
        request = null;
      }
    };
    const load = () => {
      if (disposed || !visible() || request) return;
      const current = { controller: new AbortController(), finished: false };
      request = current;
      const finish = (payload, failed) => {
        if (disposed || current.finished) return;
        current.finished = true;
        clearTimeout(current.timeout);
        request = null;
        const signature = failed ? 'unavailable' : JSON.stringify(payload);
        if (signature !== previous.current.signature) {
          previous.current.signature = signature;
          if (failed) callbacks.current.onUnavailable?.();
          else callbacks.current.onData?.(payload);
        }
        failures = failed ? failures + 1 : 0;
        if (active && visible()) timer = setTimeout(load, failed
          ? Math.min(intervalMs, retryMs * (2 ** Math.min(failures - 1, 8))) : intervalMs);
      };
      current.timeout = setTimeout(() => {
        finish(null, true);
        current.controller.abort();
      }, timeoutMs);
      fetch(url, { signal: current.controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('Service unavailable');
          const payload = await response.json();
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid status');
          return payload;
        })
        .then((payload) => finish(payload, false))
        .catch(() => finish(null, true));
    };
    const visibilityChanged = () => {
      cancel();
      if (visible() && active) load();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    if (visible() && active) load();
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [url, active, intervalMs, retryMs, timeoutMs]);
}
