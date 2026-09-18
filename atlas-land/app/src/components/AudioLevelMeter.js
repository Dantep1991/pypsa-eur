import React, { useSyncExternalStore } from 'react';

export default function AudioLevelMeter({ store, active }) {
  const level = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <div className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
      <div
        className="h-full rounded-full bg-tj-gold origin-left"
        style={{ transform: `scaleX(${Math.max(active ? 3 : 0, level) / 100})` }}
      />
    </div>
  );
}
