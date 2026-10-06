import React from 'react';
import { X } from 'lucide-react';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import { COMPARISON_COLORS, flowReversalColor, resultPalette } from '../modelWorkspace/resultColors';
import './ModelResultLegend.css';

const formatValue = value => {
  const number = Number(value), magnitude = Math.abs(number);
  if (value == null || !Number.isFinite(number)) return '—';
  const options = magnitude > 0 && magnitude < 0.1
    ? { maximumSignificantDigits: 3, notation: magnitude < 0.0001 ? 'scientific' : 'standard' }
    : { maximumFractionDigits: 1, notation: magnitude >= 100000 ? 'compact' : 'standard' };
  return new Intl.NumberFormat(undefined, options).format(number);
};

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
      </div> : <div className="atlas-result-legend__gradient" style={{ '--atlas-result-colours': resultPalette(legend).join(',') }} />}
      <div className="atlas-result-legend__range"><span>{formatValue(legend.minimum)} {legend.unit}</span><span>{formatValue(legend.maximum)} {legend.unit}</span></div></>}
    {!scene.comparison && selection.map_mode !== 'mix' && scene.color_policy && <small>
      {legend.favourable_direction === 'decrease' ? 'Lower: favourable · higher: unfavourable'
        : legend.favourable_direction === 'increase' ? 'Higher: favourable · lower: unfavourable'
          : 'Neutral · no favourable direction established'}
    </small>}
    {!['Line', 'Gas Pipeline'].includes(selection.class_name) && onMarkerScaleChange && <details className="atlas-result-legend__size"><summary>Circle size</summary><ResultMarkerSizeControl value={markerScale} onChange={onMarkerScaleChange} /></details>}
  </aside>;
}
