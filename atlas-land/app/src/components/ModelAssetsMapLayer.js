import React, { useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, Tooltip } from 'react-leaflet';
import { RESULT_SERIES_COLORS } from '../modelWorkspace/resultColors';

export default function ModelAssetsMapLayer({ frame, onSelect }) {
  const renderer = useMemo(() => L.svg(), []);
  if (!frame) return null;
  return <>{frame.markers.map(marker => <CircleMarker key={marker.id} renderer={renderer} center={marker.position}
    radius={frame.hasValues ? 7 + 12 * Math.sqrt(marker.maximum / (frame.maximum || 1)) : Math.min(15, 7 + Math.log2(marker.objects.length))}
    pathOptions={{ color: '#ffffff', weight: marker.objects.some(obj => obj.id === frame.selectedId) ? 4 : 2,
      fillColor: frame.measurementMode && !marker.measured ? 'var(--atlas-map-muted)' : RESULT_SERIES_COLORS[3], fillOpacity: 0.9 }}
    eventHandlers={{ click: () => onSelect?.(marker.objects[0].id) }}>
    <Tooltip><strong>{marker.nodes.map(node => node.name).join(' · ')}</strong><br />
      {marker.objects.length} model object{marker.objects.length === 1 ? '' : 's'}<br />
      {marker.objects.slice(0, 4).map(obj => <React.Fragment key={obj.id}>{obj.name}
        {obj.measurement?.value != null ? ` · ${obj.measurement.value.toLocaleString()} ${obj.measurement.unit}`
          : obj.measurement?.note ? ` · ${obj.measurement.note}` : frame.measurementMode ? ' · Not reported at this period' : ''}<br /></React.Fragment>)}
      {marker.objects.length > 4 && 'Select to inspect all objects at this location.'}
      {frame.hasValues && <><br />Size: largest absolute asset value, not a node total.</>}
    </Tooltip>
  </CircleMarker>)}</>;
}
