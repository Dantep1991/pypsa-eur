import { useEffect, useLayoutEffect, useRef } from 'react';

// Camera effects can emit Leaflet events synchronously during React's passive
// effect phase. Re-subscribing on each render creates a gap exactly when an
// automatic country fit runs, leaving culling bounds stuck on the previous city.
export function useMapTelemetry(map, { onZoomChange, onBoundsChange, onInteractionChange }) {
  const callbacks = useRef({ onZoomChange, onBoundsChange, onInteractionChange });
  useLayoutEffect(() => {
    callbacks.current = { onZoomChange, onBoundsChange, onInteractionChange };
  }, [onZoomChange, onBoundsChange, onInteractionChange]);

  useEffect(() => {
    if (!map) return undefined;
    let idleTimer;
    const publish = () => {
      callbacks.current.onZoomChange?.(map.getZoom());
      callbacks.current.onBoundsChange?.(map.getBounds());
    };
    const started = () => {
      clearTimeout(idleTimer);
      callbacks.current.onInteractionChange?.(true);
    };
    const settled = () => {
      publish();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => callbacks.current.onInteractionChange?.(false), 120);
    };
    map.on('movestart zoomstart', started);
    map.on('moveend zoomend load', settled);
    // A country fit may already have happened before this first mount.
    publish();
    return () => {
      clearTimeout(idleTimer);
      map.off('movestart zoomstart', started);
      map.off('moveend zoomend load', settled);
    };
  }, [map]);
}
