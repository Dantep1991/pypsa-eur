import React, { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, Pane, Tooltip, useMap } from 'react-leaflet';
import { RESULT_SERIES_COLORS } from '../modelWorkspace/resultColors';

function FocusSelectedAsset({ frame }) {
  const map = useMap();
  const marker = frame?.markers.find(item => item.objects.some(obj => obj.id === frame.selectedId));
  const lat = marker?.position[0], lon = marker?.position[1];
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.panInside([lat, lon], {
      paddingTopLeft: [30, 90], paddingBottomRight: [410, 120],
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    });
  }, [map, frame?.selectedId, lat, lon]);
  return null;
}

export const modelAssetRadius = (marker, frame) => {
  if (!frame.measurementMode) return 10;
  if (!marker.measured) return 7;
  if (!frame.hasValues) return 10;
  // Area, not diameter, represents magnitude. Keep tiny/zero values selectable.
  return Math.max(6, 32 * Math.sqrt(Math.min(1, marker.maximum / (frame.maximum || 1))));
};

export default function ModelAssetsMapLayer({ frame, onSelect }) {
  const renderer = useMemo(() => L.svg({ pane: 'model-assets' }), []);
  if (!frame) return null;
  return <><FocusSelectedAsset frame={frame} /><Pane name="model-assets-tooltips" style={{ zIndex: 740 }} />
    {/* Above the Access canvas (675), whose transparent extent otherwise
        receives pointer events before these visible SVG data bubbles. */}
    <Pane name="model-assets" style={{ zIndex: 680 }}>{frame.markers.map(marker => {
    const selected = marker.objects.some(obj => obj.id === frame.selectedId);
    const displayed = [...marker.objects].sort((a, b) => Number(b.id === frame.selectedId) - Number(a.id === frame.selectedId)
      || (Math.abs(b.measurement?.value) || 0) - (Math.abs(a.measurement?.value) || 0));
    const tooltipKey = JSON.stringify([marker.id, selected, frame.label,
      displayed.map(obj => [obj.id, obj.measurement?.value, obj.measurement?.unit, obj.measurement?.note])]);
    return <CircleMarker key={marker.id} renderer={renderer} center={marker.position} pane="model-assets" bubblingMouseEvents={false}
    radius={modelAssetRadius(marker, frame)}
    pathOptions={{ color: selected ? 'var(--accent-warning)' : 'var(--atlas-map-text)', weight: selected ? 5 : 2,
      fillColor: frame.measurementMode && !marker.measured ? 'var(--atlas-map-muted)' : RESULT_SERIES_COLORS[3],
      fillOpacity: frame.measurementMode && !marker.measured ? 0.3 : 0.9,
      dashArray: frame.measurementMode && !marker.measured ? '3 3' : undefined }}
    eventHandlers={{ click: event => {
      if (event?.originalEvent) { L.DomEvent.stopPropagation(event.originalEvent); event.originalEvent.atlasAssetSelected = true; }
      onSelect?.(selected ? '' : displayed[0].id);
    } }}>
    <Tooltip key={tooltipKey} permanent={selected} direction="auto" sticky interactive opacity={0.98} atlasTooltipPriority={40}
      pane="model-assets-tooltips" className="model-assets-tooltip"><div className="model-assets-tooltip-content"><strong>{marker.nodes.map(node => node.name).join(' · ')}</strong><br />
      {frame.measurementMode && <><strong>{frame.label}</strong><br /></>}
      {marker.objects.length} model object{marker.objects.length === 1 ? '' : 's'}<br />
      {frame.hasValues && marker.measured > 0 && marker.objects.length > 1 && <>
        Largest asset magnitude: {marker.maximum.toLocaleString()} {displayed.find(obj => obj.measurement?.unit)?.measurement.unit}<br /></>}
      {displayed.map(obj => <div className="model-assets-tooltip-object" key={obj.id}><strong>{obj.name}</strong>
        {Number.isFinite(obj.measurement?.value) ? ` · ${obj.measurement.value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${obj.measurement.unit}`
          : obj.measurement?.note ? ` · ${obj.measurement.note}` : frame.measurementMode ? ' · Input not resolved' : ''}
        {obj.measurement?.operands?.map(operand => <small key={operand.property}>{operand.property}: {Number.isFinite(operand.value)
          ? `${operand.value.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${operand.unit || ''}` : operand.note || 'Input not resolved'}</small>)}
      </div>)}
      {frame.hasValues && <><br />Area: largest absolute asset value, not a node total.</>}
      {frame.incompatibleUnits && <><br />Equal sizes: selected values have incompatible units.</>}
      </div>
    </Tooltip>
  </CircleMarker>;
  })}</Pane></>;
}
