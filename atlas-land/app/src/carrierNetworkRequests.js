export const CARRIER_NETWORK_TIMEOUT_MS = 90_000;

// One pending request per carrier, with a shared cap on owned network downloads.
// Lightweight status reads bypass the network queue. A slot covers fetch AND
// body decode, not just response headers; overlapping callers share this budget.
// Race the entire body read as well as fetch: an aborted/stranded body must
// not leave the workspace waiting indefinitely.
export function createCarrierNetworkRequests({
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = CARRIER_NETWORK_TIMEOUT_MS,
  maxConcurrentNetworks = 2,
} = {}) {
  if (!Number.isInteger(maxConcurrentNetworks) || maxConcurrentNetworks < 1) {
    throw new Error('The network download limit must be a positive integer.');
  }
  const pending = new Map();
  const waiting = [];
  let activeNetworks = 0;
  const pump = () => {
    while (activeNetworks < maxConcurrentNetworks && waiting.length) waiting.shift()();
  };
  const cancel = (key) => pending.get(key)?.cancel();
  return {
    hasPending(key) { return pending.has(key); },
    cancel,
    cancelAll() {
      pending.forEach((entry) => entry.cancel());
      pending.clear();
    },
    async read(key, url, errorMessage, { kind = 'network' } = {}) {
      cancel(key);
      const controller = new AbortController();
      let stopError;
      let rejectStop;
      let cancelQueued;
      let releaseNetwork;
      const stopped = new Promise((resolve, reject) => { rejectStop = reject; });
      const stop = (error) => {
        if (stopError) return;
        stopError = error;
        rejectStop(error);
        cancelQueued?.();
        controller.abort();
      };
      const entry = { cancel: () => {
        const error = new Error('Network request cancelled because it was superseded or the workspace closed.');
        error.name = 'AbortError';
        stop(error);
      } };
      pending.set(key, entry);
      const timer = setTimeout(() => stop(new Error(
        `${errorMessage} The download timed out. Please try again.`,
      )), kind === 'status' ? Math.min(timeoutMs, 30_000) : timeoutMs);
      const claim = () => {
        activeNetworks += 1;
        releaseNetwork = () => {
          releaseNetwork = null;
          activeNetworks -= 1;
          pump();
        };
      };
      let waitForSlot;
      if (kind !== 'status') {
        if (activeNetworks < maxConcurrentNetworks) claim();
        else waitForSlot = new Promise((resolve, reject) => {
          const grant = () => {
            cancelQueued = null;
            if (stopError) { reject(stopError); return; }
            claim();
            resolve();
          };
          cancelQueued = () => {
            const index = waiting.indexOf(grant);
            if (index >= 0) waiting.splice(index, 1);
            cancelQueued = null;
            reject(stopError);
          };
          waiting.push(grant);
        });
      }
      try {
        return await Promise.race([stopped, (async () => {
          if (waitForSlot) await waitForSlot;
          if (stopError) throw stopError;
          const response = await fetchImpl(url, { signal: controller.signal });
          // Don't parse a large late response from a transport that ignored abort.
          if (stopError) throw stopError;
          const payload = await response.json();
          if (stopError) throw stopError;
          if (!response.ok) throw new Error(payload?.error || errorMessage);
          if (kind === 'status' && payload?.available === false) {
            throw new Error(payload.error || errorMessage);
          }
          const valid = kind === 'status'
            ? payload?.available === true && Array.isArray(payload.countries)
            : Array.isArray(payload?.facilities) && Array.isArray(payload?.connections);
          if (!valid) {
            throw new Error(`${errorMessage} The server returned an invalid network dataset.`);
          }
          return payload;
        })()]);
      } finally {
        clearTimeout(timer);
        if (pending.get(key) === entry) pending.delete(key);
        releaseNetwork?.();
      }
    },
  };
}
