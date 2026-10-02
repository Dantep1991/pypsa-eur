import React, { useState } from 'react';
import ModelControlHelp from './ModelControlHelp';
import { GEOGRAPHY_LEVELS, regionAssignment } from '../modelWorkspace/modelAggregation';
import './ModelAggregationControls.css';

export default function ModelAggregationControls({ catalog, countries, value, status, nativeLabel, onApply }) {
  const [schemeId, setSchemeId] = useState('ec-high-level');
  const [regionIds, setRegionIds] = useState([]);
  const [error, setError] = useState('');
  const [regionalOpen, setRegionalOpen] = useState(false);
  const schemes = catalog?.regional_registry?.schemes || [];
  const scheme = schemes.find(item => item.id === schemeId) || schemes[0];
  const chosen = scheme?.regions.filter(region => regionIds.includes(region.id)) || [];
  const busy = status?.state === 'loading';
  const nativeIndex = GEOGRAPHY_LEVELS.findIndex(([id]) => id === catalog?.native_resolution);
  const available = id => ['country', 'regional'].includes(id)
    || (id === 'bidding_zone' && nativeIndex >= 0
      && GEOGRAPHY_LEVELS.findIndex(([level]) => level === id) >= nativeIndex);
  const apply = () => {
    try { regionAssignment(catalog, scheme.id, regionIds, countries); setError(''); onApply('regional', { schemeId: scheme.id, regionIds }); }
    catch (issue) { setError(issue.message); }
  };
  const counts = status?.preview?.meta.preview.counts;
  return <div className="model-aggregation-controls space-y-2 rounded-xl border border-white/10 p-3" aria-label="Grid aggregation">
    <div className="flex justify-between items-center"><span className="text-[10px] font-semibold">Network geography</span>
      <ModelControlHelp label="Network geography"><p>Only existing nodes in this model version are grouped. No finer data is added. Unmapped nodes remain native.</p>
        <p>Published planning regions overlap. Select disjoint regions; countries outside the selection remain separate. Sources and editions are shown below.</p>
        <p>Flows are signed net exchanges across the new boundary. Internal lines are retained in source records. Aggregated capacities are not new operational transfer limits.</p></ModelControlHelp></div>
    <select aria-label="Model network geography" value={regionalOpen ? 'regional' : value} disabled={busy || !catalog}
      className="w-full rounded-lg border border-white/10 bg-transparent px-2 py-2 text-[11px]"
      onChange={event => { const level = event.target.value; setRegionalOpen(level === 'regional'); setError(''); if (level !== 'regional') onApply(level); }}>
      <option value="native">{nativeLabel || 'Project topology'} (native)</option>
      {GEOGRAPHY_LEVELS.filter(([id]) => id !== catalog?.native_resolution).map(([id, label]) => <option key={id} value={id} disabled={!available(id)}>
        {label}{!available(id) ? ' · unavailable in this model' : ''}</option>)}
      {value === 'mixed' && <option value="mixed" disabled>Mixed TSO view</option>}
    </select>
    {(regionalOpen || value === 'regional') && <>
      <select aria-label="Regional scheme" value={scheme?.id || ''} className="w-full rounded-lg border border-white/10 bg-transparent p-2 text-[11px]"
        onChange={event => { setSchemeId(event.target.value); setRegionIds([]); setError(''); }}>
        {schemes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
      <div className="space-y-1" aria-label="Published regions">{scheme?.regions.map(region => {
        const present = region.countries.filter(country => countries.includes(country));
        const overlaps = chosen.some(item => item.id !== region.id && item.countries.some(country => present.includes(country)));
        return <label key={region.id} className={`flex gap-2 text-[10px] ${!present.length || overlaps ? 'opacity-50' : ''}`}>
          <input type="checkbox" checked={regionIds.includes(region.id)} disabled={!present.length || overlaps}
            onChange={event => setRegionIds(previous => event.target.checked ? [...previous, region.id] : previous.filter(id => id !== region.id))} />
          <span>{region.name} <span className="text-tj-slate">({present.length})</span></span>
        </label>;
      })}</div>
      <button type="button" className="w-full rounded-lg border border-tj-gold/40 bg-tj-gold/15 p-2 text-[11px] font-semibold" disabled={!regionIds.length || busy} onClick={apply}>Apply regions</button>
      <details className="text-[9px] text-tj-slate"><summary>Membership & sources</summary>{chosen.map(region => <p key={region.id} className="mt-1">
        {region.name}: {region.countries.filter(country => countries.includes(country)).join(', ')} · {region.edition} · <a href={region.source_url} target="_blank" rel="noreferrer">Source</a></p>)}</details>
    </>}
    {counts && <p className="text-[9px] text-tj-slate">{counts.sourceNodes} → {counts.projectedNodes} nodes · {counts.projectedLinks} interfaces · {counts.internalizedLinks} internal lines</p>}
    {!!status?.preview?.meta.preview.missingMappings?.length && <p className="text-[9px] text-tj-slate">{status.preview.meta.preview.missingMappings.length} unmapped nodes kept native.</p>}
    {(error || status?.state === 'error') && <p role="alert" className="text-[10px]">{error || status.error}</p>}
  </div>;
}
