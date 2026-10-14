import React, { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { DEFAULT_CLUSTER_POLICIES, nativeClusterNodes, numeric } from '../manualNetworkClusters';
import {nativeClusterTopology} from '../nativeClusterTopology';

const levels = [
  ['regions', 'Aggregate NUTS regions into clusters'],
  ['country', 'Countries'], ['nuts1', 'NUTS 1 · major regions'], ['nuts2', 'NUTS 2 · regions'],
  ['nuts3', 'NUTS 3 · small regions'], ['adm1', 'Administrative regions / states'],
  ['adm2', 'Counties / districts · administrative level 2'],
  ['adm3', 'City / municipality areas · administrative level 3'], ['spatial', 'Custom spatial clusters'],
  ['evidence', 'Current Eurostat indicator clusters'],
];
const inputClass = 'w-full rounded-lg border border-white/15 bg-transparent p-2 text-[11px]';
export default function NetworkClusteringControls({ facilities = [], connections = [], countries = [], busy, onLoadNative, onSave, onApply, regionalEvidence, evidenceRequest, growthRequest, compactBuilder=false, onBusyChange }) {
  const [level, setLevel] = useState('regions');
  const [count, setCount] = useState(20);
  const [regionLevel, setRegionLevel] = useState('nuts3');
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [job, setJob] = useState(null);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedBus, setSelectedBus] = useState('');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const generation = useRef(0);
  const nodes = useMemo(() => nativeClusterNodes(facilities), [facilities]);
  const nodeLookup = useMemo(() => new Map(nodes.map(n => [n.key, n])), [nodes]);
  const stop = () => { generation.current += 1; setPending(null); setLoading(false); setJob(null); setMessage('Stopped waiting. No grouping applied.'); };
  useEffect(()=>{onBusyChange?.(loading);},[loading,onBusyChange]);
  useEffect(() => () => { generation.current += 1; }, []);
  const build = async (request) => {
    setMessage('Loading native country networks…'); setLoading(true); setResult(null);
    const run = ++generation.current;
    try {
      const loaded = await onLoadNative?.();
      if (run !== generation.current) return;
      if (loaded === null) throw new Error('Wait for the current network update to finish.');
      setPending({ run, level: request?.growth ? 'growth' : request?.evidence ? 'evidence' : level,
        count:request?.growth?.clusters ?? count, regionLevel:request?.growth?.regionLevel ?? regionLevel,
        evidence: request?.evidence, growth:request?.growth });
    } catch (error) { setMessage(error.message); setLoading(false); }
  };
  useEffect(() => {
    if (!evidenceRequest) return;
    setLevel('evidence');
    build({evidence:evidenceRequest.data});
  }, [evidenceRequest]);
  useEffect(()=>{
    if(!growthRequest)return;
    setLevel('growth');build({growth:growthRequest.settings});
  },[growthRequest]);
  useEffect(() => {
    if (!pending || busy) return undefined;
    const { run } = pending;
    setPending(null);
    const controller = new AbortController();
    const start = async () => {
      try {
        if (!nodes.length) throw new Error('Load at least one native country network.');
        const evidence = pending.evidence || regionalEvidence;
        const topology=pending.level==='growth'?nativeClusterTopology(facilities,connections):null;
        const payload = { level: pending.level, clusters: pending.count, regionLevel: pending.regionLevel, nodes,
          sourceNetworks: [...new Set(nodes.map(n => JSON.parse(n.key)[1]))].sort(),
          ...(pending.level === 'growth' ? {evidence:pending.growth.evidence,gridConnections:topology.connections,unresolvedGridConnections:topology.unresolved} : {}),
          ...(pending.level === 'evidence' ? { boundaryFeatures: evidence?.data?.features || [], evidenceMeta: evidence?.meta || {} } : {}) };
        const response = await fetch(`${API_BASE_URL}/api/atlas/network-clusters/jobs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal,
        });
        let status = await response.json();
        if (!response.ok) throw new Error(status.error || `Clustering returned ${response.status}.`);
        while (run === generation.current && status.state === 'running') {
          setJob(status); setMessage(`${status.phase}${status.country ? ` · ${status.country}` : ''} · ${status.completed}/${status.total} ${status.unit || 'countries'}`);
          await new Promise(resolve => window.setTimeout(resolve, 500));
          if (run !== generation.current) return;
          const poll = await fetch(`${API_BASE_URL}/api/atlas/network-clusters/jobs/${status.id}`, { signal: controller.signal });
          status = await poll.json();
          if (!poll.ok) throw new Error(status.error || 'Could not read clustering progress.');
        }
        if (run !== generation.current) return;
        if (status.state !== 'complete') throw new Error(status.error || 'Clustering failed.');
        if (!status.result.groups.length) throw new Error(status.result.warnings.join(' ') || 'No covered source buses.');
        const definition = { ...status.result, id:`preview-${Date.now()}-${run}`,
          name:`${status.result.groups.length} geographic clusters`, policies: { ...DEFAULT_CLUSTER_POLICIES } };
        setResult(definition);
        if (onApply) {
          setMessage('Aggregating assets and physical interfaces…');
          await onApply(definition);
        }
        if (run !== generation.current) return;
        setMessage(`${status.result.regionCount ? `${status.result.regionCount} ${status.result.regionLevel.toUpperCase()} regions → ` : ''}${status.result.groups.length} groups · ${status.result.assignedCount}/${status.result.sourceCount} buses assigned.${onApply ? ' Shown on map.' : ''}${status.result.geographyOnlyGroupCount ? ` Full country coverage · ${status.result.networkGroupCount} grid-backed · ${status.result.geographyOnlyGroupCount} geography only.` : ''}`);
        setJob(null); setLoading(false);
      } catch (error) {
        if (run !== generation.current || controller.signal.aborted) return;
        setMessage(error.message); setJob(null); setLoading(false);
      }
    };
    start();
    // Generation guards own cancellation. New map arrays must not abort a running job.
    return undefined;
  }, [pending, busy, nodes, connections, facilities]);
  const updateGroup = (id, change) => setResult(current => ({ ...current,
    groups: current.groups.map(g => g.id === id ? { ...g, ...change } : g) }));
  const reassign = targetId => {
    if (!selectedBus) return;
    setResult(current => ({ ...current, networkChecks:undefined,
      warnings:[...current.warnings.filter(w=>!w.startsWith('Connectivity checks need')), 'Connectivity checks need rebuilding after membership edits.'],
      groups: current.groups.map(g => ({ ...g, networkConnectivity:undefined,
      ...(g.id===targetId || g.members.includes(selectedBus) ? {geometry:undefined,regionIds:undefined,regionCount:undefined} : {}),
      members: [...g.members.filter(m => m !== selectedBus), ...(g.id === targetId ? [selectedBus] : [])],
    })).filter(g => g.members.length || (g.territoryOnly&&g.geometry)).map(g => {
      if(!g.members.length)return g;
      const records = g.members.map(k => nodeLookup.get(k));
      return { ...g, territoryOnly:false,geographyOnly:false,countryCodes: [...new Set(records.map(r => r.country))],
        latitude: records.reduce((s,r) => s + r.latitude, 0) / records.length,
        longitude: records.reduce((s,r) => s + r.longitude, 0) / records.length };
    }) }));
  };
  const save = async () => {
    try {
      setMessage('Saving manual grouping…');
      const definition = { ...result, id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim() || result.name || `${[...new Set(result.groups.flatMap(g=>g.countryCodes))].join(' + ')} ${result.level.toUpperCase()}`, savedAt: new Date().toISOString() };
      await onSave(definition);
      if (onApply) await onApply(definition);
      setMessage('Saved. Select this manual grouping in Geography Domain.');
    } catch (error) { setMessage(error.message || 'Could not save this grouping.'); }
  };
  const mergeGroups = () => {
    const selected = result.groups.filter(g => selectedGroups.includes(g.id));
    if (selected.length < 2) return;
    const members = selected.flatMap(g => g.members);
    const records = members.map(k => nodeLookup.get(k));
    const merged = { id: `merged-${Date.now()}`, name: selected.map(g => g.name).join(' + '), members,
      ...(selected.every(g=>g.geometry) ? {geometry:{type:'GeometryCollection',geometries:selected.map(g=>g.geometry)},
        regionIds:[...new Set(selected.flatMap(g=>g.regionIds || []))],regionCount:selected.reduce((n,g)=>n+(g.regionCount || 0),0)} : {}),
      territoryOnly:members.length===0,
      geographyOnly:members.length===0&&selected.every(g=>g.geographyOnly===true),
      countryCodes: [...new Set(selected.flatMap(g=>g.countryCodes))],
      latitude: selected.reduce((s,g) => s + g.latitude, 0) / selected.length,
      longitude: selected.reduce((s,g) => s + g.longitude, 0) / selected.length };
    setResult(current => ({ ...current, networkChecks:undefined,
      warnings:[...current.warnings.filter(w=>!w.startsWith('Connectivity checks need')), 'Connectivity checks need rebuilding after membership edits.'],
      groups: current.groups.filter(g => !selectedGroups.includes(g.id)).concat(merged).map(g=>({...g,networkConnectivity:undefined})) }));
    setSelectedGroups([]);
  };
  return <div className="space-y-3" data-testid="network-clustering-controls">
    {!compactBuilder&&<>
    <label className="block text-[11px]">Group native network by
      <select className={inputClass} aria-label="Network cluster boundary level" value={level} disabled={loading || busy}
        onChange={e => { setLevel(e.target.value); setResult(null); }}>
        {levels.map(([id,label]) => <option key={id} value={id} disabled={id === 'evidence' && !regionalEvidence?.data?.features?.length}>{label}</option>)}
      </select>
    </label>
    {level === 'regions' && <label className="block text-[11px]">Source regions
      <select className={inputClass} aria-label="Source regions for clustering" value={regionLevel} disabled={loading || busy}
        onChange={e => {setRegionLevel(e.target.value);setResult(null);}}>
        <option value="nuts3">NUTS 3</option><option value="nuts2">NUTS 2</option>
      </select>
    </label>}
    {['spatial','regions'].includes(level) && <label className="block text-[11px]">Number of clusters
      <input className={inputClass} type="number" aria-label="Number of network clusters" min="1" max="2048"
        value={count} onChange={e => setCount(Math.max(1, Math.min(2048, Math.trunc(Number(e.target.value)) || 1)))} />
    </label>}
    <button type="button" className="w-full rounded-lg border border-tj-gold/40 bg-tj-gold p-2 text-[11px] font-semibold text-tj-navy-dark"
      disabled={!countries.length || (busy && !loading)} onClick={loading ? stop : () => build()}>{loading ? 'Stop waiting' : 'Build network grouping'}</button>
    </>}
    {compactBuilder&&loading&&<button type="button" className="w-full rounded-lg border border-white/15 p-2 text-[11px]" onClick={stop}>Stop waiting</button>}
    {loading && job && <progress className="w-full" max={job.total || 1} value={job.completed || 0} aria-label="Network clustering progress" />}
    {message && <p role="status" className="text-[11px]">{message}</p>}
    {result && <>
      {result.warnings.map((warning,i) => <p key={i} role="status" className="text-[10px]">{warning}</p>)}
      <details><summary className="text-[11px]">Boundary sources</summary>{result.sources.map(s => <p key={`${s.country || s.indicator}-${s.level}`} className="text-[10px]">
        {s.country || s.indicator}: {s.canonical || s.level} · {s.year} · {s.url?<a href={s.url} target="_blank" rel="noreferrer">{s.provider}</a>:s.provider}
      </p>)}</details>
      {result.level==='growth'&&<details><summary className="text-[11px]">Seeds ({result.groups.length})</summary>
        {result.groups.map(g=><p key={g.id} className="text-[10px]">{g.seedRegionId} · {g.name} · {g.regionCount} source regions · {g.members.length} buses{g.territoryOnly?' · land only':''}</p>)}
      </details>}
      {result.networkChecks&&<details><summary className="text-[11px]">Network checks</summary>
        <p className="text-[10px]">{result.networkChecks.everyRegionSourceConnected?'Every region has an internally connected source grid.':'Source-grid connectivity is incomplete.'} Synthetic branches: {result.networkChecks.syntheticBranches}.</p>
        {result.groups.map(g=><p className="text-[10px]" key={g.id}>{g.name}: {g.networkConnectivity?.sourceBuses} buses · {g.networkConnectivity?.inducedSourceComponents} source-grid component · {g.networkConnectivity?.crossingSourceBranchIds.length} crossing source branches · {result.networkChecks.geographicUnitComponents?.[g.id]} geographic component(s)</p>)}
        {result.networkChecks.seedAdjustments.map((a,i)=><p className="text-[10px]" key={i}>{a.regionId}: {a.reason}</p>)}
      </details>}
      <label className="block text-[11px]">Grouping name<input className={inputClass} aria-label="Manual grouping name" value={name} onChange={e => setName(e.target.value)} /></label>
      <details><summary className="text-[11px]">Edit groups ({result.groups.length})</summary>
        <input className={inputClass} aria-label="Search network groups" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search groups" />
        <div className="max-h-48 overflow-y-auto space-y-1">{result.groups.filter(g => g.name.toLowerCase().includes(filter.toLowerCase())).map(g =>
          <label key={g.id} className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" aria-label={`Select group ${g.name}`} checked={selectedGroups.includes(g.id)}
              onChange={e => setSelectedGroups(current => e.target.checked ? [...current,g.id] : current.filter(id => id !== g.id))} />
            <input className={inputClass} aria-label={`Group name ${g.id}`} value={g.name} onChange={e => updateGroup(g.id, { name: e.target.value })} />
            <span>{g.geographyOnly?'Geography only':`${g.members.length} buses`}</span>
          </label>)}</div>
        <button type="button" className="w-full rounded-lg border border-white/15 p-2 text-[11px]" disabled={selectedGroups.length < 2} onClick={mergeGroups}>Merge selected groups</button>
        <label className="block text-[11px]">Move source bus<select className={inputClass} aria-label="Source bus to reassign" value={selectedBus} onChange={e => setSelectedBus(e.target.value)}>
          <option value="">Choose a bus…</option>{nodes.map(n => <option key={n.key} value={n.key}>{n.country} · {JSON.parse(n.key)[2]}</option>)}
        </select></label>
        <label className="block text-[11px]">Destination group<select className={inputClass} aria-label="Destination network group" value="" disabled={!selectedBus} onChange={e => reassign(e.target.value)}>
          <option value="">Choose a group…</option>{result.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></label>
      </details>
      <details><summary className="text-[11px]">Property aggregation</summary>{Object.entries(result.policies).map(([field,mode]) =>
        <label key={field} className="flex items-center justify-between gap-2 text-[10px]">{field}<select aria-label={`Aggregate ${field}`} value={mode} className={inputClass}
          onChange={e => setResult(current => ({ ...current, policies: { ...current.policies, [field]: e.target.value } }))}>
          <option value="sum">Sum</option><option value="mean">Average</option><option value="capacity_weighted">Capacity-weighted average</option>
        </select></label>)}</details>
      <button type="button" className="w-full rounded-lg border border-tj-gold/40 bg-tj-gold p-2 text-[11px] font-semibold text-tj-navy-dark" onClick={save}>Save manual grouping</button>
      {onApply && <button type="button" className="w-full rounded-lg border border-tj-gold/40 p-2 text-[11px]" onClick={async()=>{
        try {await onApply({...result,name:name.trim() || result.name});setMessage('Edited groups shown on map.');}
        catch(error){setMessage(error.message);}
      }}>Apply edited groups to map</button>}
    </>}
  </div>;
}
