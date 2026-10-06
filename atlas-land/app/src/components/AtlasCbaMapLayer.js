import React, { useMemo } from 'react';
import L from 'leaflet';
import { CircleMarker, Pane, Polyline, Tooltip } from 'react-leaflet';
import { COMPARISON_COLORS } from '../modelWorkspace/resultColors';
import { resultBubbleRadius } from '../modelWorkspace/resultPresentation';
import { formatCbaValue } from './AtlasCbaControls';

export function cbaMapColor(value, component) {
  if (Number(value) === 0) return COMPARISON_COLORS.neutral;
  const favourable = component === 'total' ? value < 0 : value > 0;
  return favourable ? COMPARISON_COLORS.favourable : COMPARISON_COLORS.unfavourable;
}

export default function AtlasCbaMapLayer({ scene, markerScale = 1 }) {
  const renderer = useMemo(() => L.svg({ pane: 'atlas-cba-values' }), []);
  if (!scene) return null;
  const maximum = Math.max(0, ...[...scene.points, ...scene.lines].map(row => Math.abs(row.value)));
  const tooltip = row => <Tooltip pane="network-node-tooltips" atlasTooltipPriority={40} sticky>
    <strong>{row.country || row.assetName}</strong><br />{scene.label}: {formatCbaValue(row.value)} {scene.unit}<br />
    {scene.caseId} · {scene.band}<br />{row.coordinateSource}
    {scene.quality?.certified === false && <><br />Saved test · unvalidated</>}
  </Tooltip>;
  return <Pane name="atlas-cba-values" style={{ zIndex: 660 }}>
    {scene.points.map(row => <CircleMarker key={row.country} center={[row.coordinates[1], row.coordinates[0]]} renderer={renderer}
      radius={resultBubbleRadius(maximum ? Math.abs(row.value) / maximum : 0, markerScale)} bubblingMouseEvents={false}
      pathOptions={{ color: cbaMapColor(row.value, scene.component), fillColor: cbaMapColor(row.value, scene.component), weight: 1.5, fillOpacity: .7 }}>
      {tooltip(row)}
    </CircleMarker>)}
    {scene.lines.map(row => <Polyline key={`${row.id}:${row.energyCarrier || ''}`} renderer={renderer} bubblingMouseEvents={false}
      positions={row.coordinates.map(([lon, lat]) => [lat, lon])}
      pathOptions={{ color: cbaMapColor(row.value, scene.component), weight: 2 + (maximum ? Math.abs(row.value) / maximum * 6 : 0), opacity: .9,
        dashArray: row.className === 'Gas Pipeline' ? '8 5' : undefined }}>{tooltip(row)}</Polyline>)}
  </Pane>;
}
