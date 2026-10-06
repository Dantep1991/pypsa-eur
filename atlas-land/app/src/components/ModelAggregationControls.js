import React, { useState } from 'react';
import ModelControlHelp from './ModelControlHelp';
import ModelRegionalSelection from './ModelRegionalSelection';
import { GEOGRAPHY_LEVELS, regionAssignment } from '../modelWorkspace/modelAggregation';
import './ModelAggregationControls.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { enumField } from '../agentWorkspace/registry';

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
  const agent = useWorkspaceAgentRegistry();
  useWorkspaceAgentController('geography', {
    ready: Boolean(catalog && !busy),
    fields: {
      resolution: enumField('Network geography', ['native', ...GEOGRAPHY_LEVELS.filter(([id]) => id !== catalog?.native_resolution && available(id)).map(([id]) => id)]),
      schemeId: enumField('Regional scheme', schemes.map(row => ({ value: row.id, label: row.name || row.label || row.id }))),
      regionIds: { ...enumField('Regional groups', schemes.flatMap(item => item.regions.map(row => ({ value: row.id,
        label: row.name || row.label || row.id, countries: row.countries, schemeId: item.id })))), type: 'list' },
    },
    actions: { show: { description: 'Apply native, bidding-zone, country or named regional aggregation.' },
      configure: { description: 'Select a regional scheme and its groups before applying.' } },
    state: { resolution: value, schemeId: scheme?.id, regionIds, loading: busy, error: error || status?.error, counts },
  }, async (action, values) => {
    const nextScheme = values.schemeId || scheme?.id, nextRegions = values.regionIds || regionIds;
    setSchemeId(nextScheme); setRegionIds(nextRegions); setError('');
    const resolution = values.resolution || value;
    if (resolution === 'regional') {
      setRegionalOpen(true);
      regionAssignment(catalog, nextScheme, nextRegions, countries);
    } else setRegionalOpen(false);
    if (action === 'show') {
      onApply(resolution, resolution === 'regional' ? { schemeId: nextScheme, regionIds: nextRegions } : {});
      const next = await agent.wait('geography', item => item?.ready && (item.state.resolution === resolution || item.state.error));
      if (next.state.error) throw new Error(next.state.error);
    }
    return action === 'configure' ? 'Geography controls selected.' : 'Model geography updated.';
  });
  return <div className="model-aggregation-controls space-y-2 rounded-xl border border-white/10 p-3" aria-label="Grid aggregation">
    <div className="flex justify-between items-center"><span className="text-[10px] font-semibold">Network geography</span>
      <ModelControlHelp label="Network geography"><p>Only existing nodes in this model version are grouped. No finer data is added. Unmapped nodes remain native.</p>
        <p>Select multiple published regions. Overlapping selections are combined for this map view, with each country counted once. Countries outside the selection remain separate. Published definitions are unchanged.</p>
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
      <ModelRegionalSelection catalog={catalog} countries={countries} schemeId={scheme?.id} regionIds={regionIds} busy={busy}
        onChange={selection => { setSchemeId(selection.schemeId); setRegionIds(selection.regionIds); setError(''); }} />
      <button type="button" className="model-aggregation-apply w-full rounded-lg border p-2 text-[11px] font-semibold" disabled={!chosen.length || busy} onClick={apply}>{busy ? 'Applying regions…' : 'Apply regions'}</button>
    </>}
    {counts && <p className="text-[9px] text-tj-slate">{counts.sourceNodes} → {counts.projectedNodes} nodes · {counts.projectedLinks} interfaces · {counts.internalizedLinks} internal lines</p>}
    {!!status?.preview?.meta.preview.missingMappings?.length && <p className="text-[9px] text-tj-slate">{status.preview.meta.preview.missingMappings.length} unmapped nodes kept native.</p>}
    {(error || status?.state === 'error') && <p role="alert" className="text-[10px]">{error || status.error}</p>}
  </div>;
}
