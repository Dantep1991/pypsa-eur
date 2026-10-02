import React, { useId } from 'react';
import { DEFAULT_RESULT_MARKER_SCALE, normalizeResultMarkerScale } from '../modelWorkspace/resultPresentation';
import './ResultMarkerSizeControl.css';

export default function ResultMarkerSizeControl({ value = DEFAULT_RESULT_MARKER_SCALE, onChange }) {
  const id = useId();
  const percent = Math.round(normalizeResultMarkerScale(value) * 100);
  const change = event => onChange?.(normalizeResultMarkerScale(Number(event.currentTarget.value) / 100));
  return <div className="atlas-result-marker-size">
    <div className="atlas-result-marker-size__heading">
      <label htmlFor={id}>Circle size</label>
      <output htmlFor={id}>{percent}%</output>
      <button type="button" onClick={() => onChange?.(DEFAULT_RESULT_MARKER_SCALE)}
        disabled={percent === 100} aria-label="Reset circle size">Reset</button>
    </div>
    <input id={id} type="range" min="50" max="200" step="10" value={percent}
      aria-valuetext={`${percent} percent`} onInput={change} onChange={change} />
  </div>;
}
