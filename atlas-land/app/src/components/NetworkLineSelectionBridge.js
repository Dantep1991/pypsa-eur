import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { createNetworkLinePicker } from '../networkLineSelection';
import { connectionTooltipContent } from '../connectionTooltipContent';

export default function NetworkLineSelectionBridge({ enabled, data, onSelect }) {
  const map = useMap();
  const pick = useMemo(() => createNetworkLinePicker(data), [data]);
  useEffect(() => {
    if (!enabled) return undefined;
    let tooltip, hoveredId, pendingFrame, latestEvent;
    const hide = () => { tooltip?.remove(); tooltip = null; hoveredId = null; };
    const hover = event => {
      // A native feature has its own tooltip. Only bridge intercepted/empty canvas areas.
      if (event.sourceTarget && event.sourceTarget !== map) { leave(); return; }
      latestEvent = event;
      if (pendingFrame != null) return;
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        const point = latestEvent.containerPoint || (latestEvent.latlng && map.latLngToContainerPoint(latestEvent.latlng));
        const connection = pick(point, map);
        if (!connection || !latestEvent.latlng) { hide(); return; }
        if (!tooltip) tooltip = L.tooltip({ sticky: true, direction: 'top', opacity: 0.98, className: 'line-capacity-tooltip', interactive: false });
        if (hoveredId !== connection.id) { tooltip.setContent(connectionTooltipContent(connection)); hoveredId = connection.id; }
        tooltip.setLatLng(latestEvent.latlng).addTo(map);
      });
    };
    const leave = () => { if (pendingFrame != null) cancelAnimationFrame(pendingFrame); pendingFrame = null; hide(); };
    // Separate canvas panes can intercept clicks even in their empty areas.
    // Map-level picking gives lines a 20 px target without redrawing topology.
    const click = event => {
      leave();
      if (event.originalEvent?.atlasAssetSelected) return;
      const point = event.containerPoint || (event.latlng && map.latLngToContainerPoint(event.latlng));
      const connection = pick(point, map);
      if (connection) onSelect({ kind: 'link', record: connection });
    };
    map.on('click', click);
    map.on('mousemove', hover); map.on('mouseout movestart zoomstart', leave);
    return () => { leave(); map.off('click', click); map.off('mousemove', hover); map.off('mouseout movestart zoomstart', leave); };
  }, [map, enabled, pick, onSelect]);
  return null;
}
