import React from 'react';
import { X } from 'lucide-react';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import { COMPARISON_COLORS, flowReversalColor } from '../modelWorkspace/resultColors';
import './ModelResultLegend.css';

const formatValue = value => Number.isFinite(Number(value))
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: Math.abs(Number(value)) >= 100000 ? 'compact' : 'standard' }).format(Number(value)) : '—';

export default function ModelResultLegend({ scene, onClear, markerScale, onMarkerScaleChange, theme = 'dark' }) {
  if (!scene) return null;
  const selection = scene.selection || {}, legend = scene.legend || {};
  const categories = [...new Map((scene.values || []).flatMap(row => row.segments || []).map(segment => [segment.key, segment])).values()];
  const swatch = (label, color) => <span className="atlas-result-legend__swatch"><i style={{ background: color }} />{label}</span>;
  return <aside aria-label="Model result legend" className="atlas-result-legend">
    <div className="atlas-result-legend__heading">
      <strong>{scene.comparison ? 'Δ ' : ''}{selection.class_name} · {selection.property_name} <span>({legend.unit})</span></strong>
      <span>{selection.period_label}</span>
      <button type="button" onClick={onClear} aria-label="Clear result layer"><X size={14} /></button>
    </div>
    {selection.map_mode === 'mix' ? <div className="atlas-result-legend__keys">{categories.map(segment => <React.Fragment key={segment.key}>{swatch(segment.label, segment.color)}</React.Fragment>)}</div>
      : <>{scene.comparison ? <div className="atlas-result-legend__keys">
        {swatch('Unfavourable', COMPARISON_COLORS.unfavourable)}{swatch('Favourable', COMPARISON_COLORS.favourable)}
        {selection.direction_supported && swatch('Flow reversed', flowReversalColor(theme))}
        {swatch('Unchanged / unclassified', COMPARISON_COLORS.neutral)}
      </div> : <div className="atlas-result-legend__gradient" />}
      <div className="atlas-result-legend__range"><span>{formatValue(legend.minimum)} {legend.unit}</span><span>{formatValue(legend.maximum)} {legend.unit}</span></div></>}
    {!['Line', 'Gas Pipeline'].includes(selection.class_name) && onMarkerScaleChange && <details className="atlas-result-legend__size"><summary>Circle size</summary><ResultMarkerSizeControl value={markerScale} onChange={onMarkerScaleChange} /></details>}
  </aside>;
}
