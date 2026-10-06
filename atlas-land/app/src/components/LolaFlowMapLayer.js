import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Pane, Polyline, Tooltip } from 'react-leaflet';
import ModelResultFlowLayer from './ModelResultFlowLayer';
import { flowMetricsLabel } from '../modelWorkspace/flowPeriodMetrics';

function SelectableFlowLine({ line, renderer, selectedId, onSelect }) {
  const layerRef = useRef(null);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;
    let path;
    const keydown = event => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect?.(line.id); }
    };
    const attach = () => {
      const next = layer.getElement();
      if (!next || next === path) return;
      path?.removeEventListener('keydown', keydown);
      path = next;
      path.setAttribute('data-flow-connection', line.id);
      path.setAttribute('aria-label', `Flow connection ${line.name}`);
      path.setAttribute('role', 'button'); path.setAttribute('tabindex', '0');
      path.setAttribute('aria-pressed', String(line.id === selectedId));
      path.style.cursor = 'pointer';
      path.addEventListener('keydown', keydown);
    };
    attach(); layer.on('add', attach);
    return () => { layer.off('add', attach); path?.removeEventListener('keydown', keydown); };
  }, [line.id, line.name, onSelect, selectedId]);
  return <><Polyline renderer={renderer} interactive={false}
    positions={line.coordinates.map(([lon, lat]) => [lat, lon])}
    pathOptions={{ color: line.color, weight: line.id === selectedId ? 5 : 3,
      opacity: selectedId && line.id !== selectedId ? 0.6 : 0.95 }} />
  <Polyline ref={layerRef} renderer={renderer} bubblingMouseEvents={false}
    positions={line.coordinates.map(([lon, lat]) => [lat, lon])}
    pathOptions={{ color: line.color, weight: 16, opacity: 0 }}
    eventHandlers={{ click: () => onSelect?.(line.id) }}>
    <Tooltip><strong>{line.name}</strong><br />{line.value === 0 ? (line.net ? 'No net flow' : 'Zero flow') : `${line.actualFrom} → ${line.actualTo}`}<br />
      {line.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} {line.unit} · {line.period}
      {line.metrics && <><br />{flowMetricsLabel(line.metrics, line.annual, line.net)}</>}
      {line.metrics && <><br />Directional limit: {line.metrics.capacity.toLocaleString()} {line.metrics.capacityUnit}</>}
      {line.annual && <><br />Annual equivalent · not hourly congestion</>}
      {line.aggregated && <><br />{line.sourceIds.length} source connections · net exchange
        <br />{line.capacityNote}<br />Select to inspect a member connection.</>}
      {line.capacityEvidence && <><br />{line.capacityEvidence.nearHours} / {line.capacityEvidence.validHours} comparable hours ≥{line.capacityEvidence.nearPercent??99}% capacity
        <br />Coverage: {line.capacityEvidence.validHours} / {line.capacityEvidence.expectedHours} calendar hours</>}</Tooltip>
  </Polyline></>;
}

export default function LolaFlowMapLayer({ frame, onSelect }) {
  // Explicit SVG hit paths remain selectable even when the base map prefers canvas.
  // The base network's canvas can be mounted later in overlayPane. A separate
  // pane keeps the SVG hit paths above that canvas and below tooltips/popups.
  const renderer = useMemo(() => L.svg({ pane: 'atlas-flow-connections' }), []);
  if (!frame) return null;
  return <>
    <ModelResultFlowLayer lines={frame.lines} animated={frame.animated} animationSpeed={frame.animationSpeed} selectedId={frame.selectedId} maximum={frame.maximum} />
    <Pane name="atlas-flow-connections" style={{ zIndex: 460 }}>
      {frame.lines.map(line => <SelectableFlowLine key={line.id} line={line} renderer={renderer}
        selectedId={frame.selectedId} onSelect={onSelect} />)}
    </Pane>
  </>;
}
