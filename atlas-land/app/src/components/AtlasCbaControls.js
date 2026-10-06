import React from 'react';
import { cbaBands, cbaComponents, defaultCbaSelection } from '../modelWorkspace/cbaScene';
import { COMPARISON_COLORS } from '../modelWorkspace/resultColors';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import './ModelResultsControls.css';
import './AtlasCbaControls.css';

export const formatCbaValue = value => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function AtlasCbaControls({ catalog, selection, onSelectionChange, status, onShow, onClear, markerScale, onMarkerScaleChange }) {
  const study = catalog.studies.find(item => item.projectId === selection?.studyId);
  if (!study || !selection) return null;
  const busy = status.state === 'loading';
  const components = cbaComponents(study, selection.caseId, selection.band);
  const bands = cbaBands(study, selection.caseId);
  const total = study.summary.tscDelta[selection.band]?.[selection.caseId]?.total;
  const update = next => {
    onClear();
    const component = components.find(item => item.id === next.component);
    onSelectionChange({ ...next, component: component?.available ? next.component : 'total',
      map: component?.available && next.component === 'congestion' ? next.map : 'country' });
  };
  return <div className="atlas-results-controls atlas-cba-controls">
    <div className="atlas-results-controls__fields">
      <label className="atlas-results-controls__field is-wide"><span>Theo study</span>
        <select aria-label="CBA study" value={study.projectId} disabled={busy} onChange={event => {
          onClear(); onSelectionChange(defaultCbaSelection(catalog.studies.find(item => item.projectId === event.target.value)));
        }}>{catalog.studies.map(item => <option key={item.projectId} value={item.projectId}>{item.name}</option>)}</select>
      </label>
      <label className="atlas-results-controls__field is-wide"><span>Assessed project</span>
        <select aria-label="CBA assessed project" value={selection.caseId} disabled={busy} onChange={event => {
          const band = cbaBands(study, event.target.value).includes(selection.band) ? selection.band : cbaBands(study, event.target.value)[0];
          const available = cbaComponents(study, event.target.value, band).find(item => item.id === selection.component)?.available;
          onClear(); onSelectionChange({ ...selection, caseId: event.target.value, band,
            component: available ? selection.component : 'total', map: available ? selection.map : 'country' });
        }}>{study.cases.map(item => <option key={item} value={item}>{item}</option>)}</select>
      </label>
      <label className="atlas-results-controls__field"><span>Scenario / year</span>
        <select aria-label="CBA scenario" value={selection.band} disabled={busy} onChange={event => {
          const available = cbaComponents(study, selection.caseId, event.target.value).find(item => item.id === selection.component)?.available;
          onClear(); onSelectionChange({ ...selection, band: event.target.value, component: available ? selection.component : 'total', map: available ? selection.map : 'country' });
        }}>{bands.map(item => <option key={item} value={item}>{item}{study.targetYears?.length && !study.targetYears.includes(item) ? ` · ${study.targetYears.join(', ')}` : ''}</option>)}</select>
      </label>
      <label className="atlas-results-controls__field"><span>Visualisation</span>
        <select aria-label="CBA visualisation" value={selection.map} disabled={busy} onChange={event => update({ ...selection,
          map: event.target.value, component: event.target.value === 'connections' ? 'congestion' : selection.component })}>
          <option value="country">Country value map</option>
          <option value="connections" disabled={!components.find(item => item.id === 'congestion')?.available}>Congestion rent map</option>
        </select>
      </label>
      <label className="atlas-results-controls__field is-wide"><span>Value</span>
        <select aria-label="CBA value" value={selection.component} disabled={busy} onChange={event => update({ ...selection, component: event.target.value })}>
          {components.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.label}{!item.available ? ' · not assessed' : ''}</option>)}
        </select>
      </label>
    </div>
    <div className="atlas-cba-total"><span>Δ total system costs</span><strong>{formatCbaValue(total)} M EUR</strong></div>
    {study.summary.quality?.certified === false && <p role="note" className="atlas-cba-note">Saved test · unvalidated</p>}
    {study.discoveryWarnings?.map((warning, index) => <p role="note" className="atlas-cba-note" key={index}>{warning}</p>)}
    {selection.map === 'country' && <ResultMarkerSizeControl value={markerScale} onChange={onMarkerScaleChange} />}
    <div className="atlas-cba-key"><span><i style={{ background: COMPARISON_COLORS.favourable }} />Favourable</span>
      <span><i style={{ background: COMPARISON_COLORS.unfavourable }} />Unfavourable</span></div>
    <p className="atlas-cba-note">{selection.component === 'total' ? 'Lower system costs are favourable.' : 'Higher rents are favourable for the selected group.'}</p>
    {busy && <div role="status" aria-label="CBA loading progress" className="atlas-results-notice">{status.progress?.phase} · {status.progress?.completed}/{status.progress?.total}</div>}
    {status.error && <div role="alert" className="atlas-results-notice is-error">{status.error}</div>}
    {status.data && <div role="status" className="atlas-cba-note">
      {status.data.coverage.mapped} / {status.data.coverage.reported} {selection.map === 'country' ? 'countries' : 'connections'} mapped.
      {status.data.coverage.unmapped > 0 && <p>{status.data.coverage.unmapped} without an unambiguous geography match.</p>}
      {status.data.notes.map((note, index) => <p key={index}>{note}</p>)}
      {status.data.reconciliation && !status.data.reconciliation.matched && <p>Reconciliation gap: {formatCbaValue(status.data.reconciliation.residual)} M EUR.</p>}
      {!!status.data.warnings.length && <details><summary>Geography details</summary>{status.data.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
    </div>}
    <div className="atlas-cba-actions"><button className="atlas-cba-primary" type="button" disabled={busy} onClick={onShow}>Show on map</button>
      <button type="button" onClick={onClear} disabled={busy || !status.data}>Clear</button></div>
    <a className="atlas-cba-theo-link" href={`/theo/cba/cost-benefit-analysis?project=${encodeURIComponent(study.projectId)}&assetProjectId=${encodeURIComponent(selection.caseId)}`} target="_blank" rel="noopener noreferrer">Open assessment in Theo</a>
  </div>;
}
