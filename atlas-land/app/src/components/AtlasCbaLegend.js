import React from 'react';
import { X } from 'lucide-react';
import { COMPARISON_COLORS } from '../modelWorkspace/resultColors';
import './ModelResultLegend.css';

export default function AtlasCbaLegend({ scene, onClear }) {
  if (!scene) return null;
  return <aside className="atlas-result-legend" aria-label="CBA map legend">
    <div className="atlas-result-legend__heading"><strong>{scene.label} <span>({scene.unit})</span></strong>
      <span>{scene.caseId} · {scene.band}</span><button type="button" aria-label="Clear CBA map" onClick={onClear}><X size={14} /></button></div>
    <div className="atlas-result-legend__keys">{['favourable', 'unfavourable', 'neutral'].map(key =>
      <span className="atlas-result-legend__swatch" key={key}><i style={{ background: COMPARISON_COLORS[key] }} />
        {key === 'neutral' ? 'No change' : key === 'favourable' ? 'Favourable' : 'Unfavourable'}</span>)}</div>
    <small>{scene.component === 'total' ? 'Lower system costs are favourable' : 'Higher rents are favourable for the selected group'} · {scene.coverage.mapped}/{scene.coverage.reported} mapped</small>
  </aside>;
}
