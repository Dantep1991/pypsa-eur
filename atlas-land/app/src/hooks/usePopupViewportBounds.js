import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { installPopupCameraRecovery } from '../popupCameraRecovery';

// Leaflet pans to make a popup readable. Re-culling point GeoJSON during that
// pan would replace its owning marker and immediately close the popup. Keep
// only the point-culling bounds stable until it closes; camera/land telemetry
// and explicit changes to countries, domains and network data remain live.
export function usePopupViewportBounds(map, bounds, onVisibilityChange, dismissRequest = 0) {
  const latestBounds = useRef(bounds);
  const visibilityChange = useRef(onVisibilityChange);
  const [popupBounds, setPopupBounds] = useState(null);
  const lastDismissRequest = useRef(dismissRequest);
  useEffect(() => map ? installPopupCameraRecovery(map) : undefined, [map]);
  useLayoutEffect(() => { latestBounds.current = bounds; }, [bounds]);
  useLayoutEffect(() => { visibilityChange.current = onVisibilityChange; }, [onVisibilityChange]);
  useEffect(() => {
    if (!map || lastDismissRequest.current === dismissRequest) return;
    lastDismissRequest.current = dismissRequest;
    map.closePopup?.();
    setPopupBounds(null);
    visibilityChange.current?.(false);
  }, [map, dismissRequest]);
  useEffect(() => {
    if (!map) return undefined;
    const opened = () => {
      setPopupBounds(latestBounds.current || map.getBounds());
      visibilityChange.current?.(true);
    };
    const closed = () => {
      setPopupBounds(null);
      visibilityChange.current?.(false);
    };
    const navigating = () => {
      map.closePopup?.();
      closed();
    };
    map.on('popupopen', opened);
    map.on('popupclose', closed);
    map.on('dragstart zoomstart resize', navigating);
    return () => {
      map.off('popupopen', opened);
      map.off('popupclose', closed);
      map.off('dragstart zoomstart resize', navigating);
      visibilityChange.current?.(false);
    };
  }, [map]);
  return popupBounds || bounds;
}
