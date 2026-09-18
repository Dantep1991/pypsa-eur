// High-frequency microphone samples belong to the meter, not App's map state.
export function createAudioLevelStore() {
  let value = 0;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (next) => {
      const normalized = Math.max(0, Math.min(100, Math.round(Number(next) || 0)));
      if (value === normalized) return;
      value = normalized;
      listeners.forEach((listener) => listener());
    },
  };
}
