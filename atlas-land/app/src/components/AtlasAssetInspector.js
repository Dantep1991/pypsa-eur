import React, { useEffect, useMemo, useRef, useState } from 'react';
import { assetFacts, nodePortfolio, recordName } from '../atlasPresentation';
import { getConnectionCapacity } from '../connectionCapacity';
import { buildGeoJsonPopupContent } from '../assetDetailContent';

const tabs = [['overview', 'Overview'], ['costs', 'Costs'], ['time', 'Time-series']];
let inspectorSequence = 0;

export default function AtlasAssetInspector({ selection, facilities, connections, onSelect }) {
  const [tab, setTab] = useState('overview');
  const id = useRef(null);
  if (!id.current) id.current = `atlas-inspector-${++inspectorSequence}`;
  const record = selection?.record;
  useEffect(() => { setTab('overview'); }, [record]);
  const locationItems = useMemo(() => {
    if (!record || selection.kind !== 'node') return [];
    const visible = new Set(facilities.map(item => String(item.id)));
    const seen = new Set();
    return [record, ...(record.sameLocationFacilities || [])].filter(item => {
      const key = String(item.id);
      if (seen.has(key) || (item !== record && !visible.has(key))) return false;
      seen.add(key); return true;
    });
  }, [record, facilities, selection?.kind]);
  const facts = useMemo(() => record ? assetFacts(record, connections) : null, [record, connections]);
  const portfolio = useMemo(() => selection?.kind === 'node' ? nodePortfolio(record, facilities) : null, [record, facilities, selection?.kind]);
  const content = useMemo(() => record ? buildGeoJsonPopupContent({ ...record, sameLocationFacilities: locationItems }, tab) : '', [record, locationItems, tab]);
  const rating = selection?.kind === 'link' ? getConnectionCapacity(record) : null;
  const sourceLinkIds = record?.source_edge_ids || record?.atlas_source_ids || [record?.id];
  const totalGeneration = portfolio?.mix.reduce((sum, item) => sum + item.capacity, 0) || 0;

  if (!record) return <div className="atlas-inspect-content atlas-inspect-empty"><strong>Select a map feature</strong><p>Click a node, region or line to view its details.</p></div>;

  return <div className="atlas-inspect-content">
    <div className="atlas-inspect-identity">
      <h3>{facts.name}</h3>
      <div className="atlas-inspect-countries">
        <span className="atlas-inspect-kind">{facts.region ? 'Visual region' : record.component_type || record.type || selection.kind}</span>
        {(record.carrier_nice_name || record.carrier) && <span>{record.carrier_nice_name || record.carrier}</span>}
        {facts.countries.map(country => <span key={country}>{country}</span>)}
      </div>
      {locationItems.length > 1 && <label className="atlas-inspect-component">Component at this location
        <select value={String(record.id)} onChange={event => {
          const next = locationItems.find(item => String(item.id) === event.target.value);
          if (next) onSelect({ kind: 'node', record: { ...next, sameLocationFacilities: locationItems } });
        }}>{locationItems.map(item => <option key={item.id} value={String(item.id)}>{recordName(item)} · {item.component_type || item.type || 'Component'}</option>)}</select>
      </label>}
    </div>
    <div className="atlas-inspect-tabs" role="tablist" aria-label="Asset details">
      {tabs.map(([key, label], index) => <button type="button" key={key} id={`${id.current}-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${id.current}-panel`} tabIndex={tab === key ? 0 : -1}
        onClick={() => setTab(key)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
          if (next === null) return;
          event.preventDefault(); event.stopPropagation(); setTab(tabs[next][0]);
          event.currentTarget.parentElement.children[next].focus();
        }}>{label}</button>)}
    </div>
    <div className="atlas-inspect-tab-content" id={`${id.current}-panel`} role="tabpanel" aria-labelledby={`${id.current}-${tab}`} tabIndex={0}>
      {/* The shared formatter escapes every source value before returning HTML. */}
      {(selection.kind !== 'link' || tab !== 'overview') && <div className="atlas-inspect-context" dangerouslySetInnerHTML={{ __html: content }} />}
      {tab === 'overview' && <>
        {Number.isFinite(record.atlas_result_value) && <div className="atlas-inspect-rating"><span>{record.atlas_result_label || 'Displayed result'}</span><strong>{record.atlas_result_value.toLocaleString()} <small>{record.atlas_result_unit || ''}</small></strong><p>{record.atlas_result_period || ''}</p></div>}
        {rating && <div className="atlas-inspect-rating"><span>{rating.kind}</span><strong>{rating.value.toLocaleString()} <small>{rating.units}</small></strong><p>Nominal rating, not spare connection capacity</p></div>}
        <dl className="atlas-inspect-facts">
          <div><dt>Source</dt><dd>{String(facts.source)}</dd></div>
          {facts.region && <div><dt>Underlying buses</dt><dd>{facts.underlying ?? 'Unknown'}</dd></div>}
        </dl>
        {selection.kind === 'link' && <section className="atlas-inspect-section atlas-inspect-endpoints" aria-label="Connection endpoints">
          <h4>Connection</h4><div className="atlas-inspect-endpoint-flow"><span>{record.from ?? record.fromNode ?? '?'}</span><b aria-hidden="true">↔</b><span>{record.to ?? record.toNode ?? '?'}</span></div>
          <details><summary>{sourceLinkIds.length} source link(s)</summary><p>{sourceLinkIds.join(', ')}</p></details>
        </section>}
        {portfolio && <details className="atlas-inspect-section" open={portfolio.mix.length > 0 || portfolio.demand !== null || portfolio.storage !== null}>
          <summary>Associated assets</summary>
          {portfolio.mix.length > 0 && <div className="atlas-inspect-mix"><h4>Generation mix <span>Installed MW</span></h4>{portfolio.mix.map(item => {
            const share = totalGeneration > 0 ? item.capacity / totalGeneration * 100 : 0;
            return <div className="atlas-inspect-mix-row" key={item.carrier}><div className="atlas-inspect-mix-label"><span>{item.carrier}</span><strong>{item.capacity.toLocaleString()} <small>{share.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</small></strong></div><div className="atlas-inspect-mix-track"><span style={{ width: `${share}%` }} /></div></div>;
          })}</div>}
          <div className="atlas-inspect-metrics"><div><span>Annual demand</span><strong>{portfolio.demand === null ? 'Not loaded' : `${portfolio.demand.toLocaleString()} GWh`}</strong>{portfolio.provisional && <small>Provisional</small>}</div><div><span>Store energy</span><strong>{portfolio.storage === null ? 'Not loaded' : `${portfolio.storage.toLocaleString()} MWh`}</strong><small>State of charge: unknown</small></div></div>
          <small className="atlas-inspect-provenance">Associated visible records only; hidden layers and national totals are not included.</small>
        </details>}
        {selection.kind !== 'link' && <details className="atlas-inspect-section atlas-inspect-connections" open>
          <summary>Displayed connections <b>{facts.links.length}</b></summary>
          {facts.links.length ? <div className="atlas-inspect-connection-list">{facts.links.map((edge, index) => <button type="button" className="atlas-inspect-link" key={`${edge.id}-${index}`} onClick={() => onSelect({ kind: 'link', record: edge })}><span>{recordName(edge)}</span><b aria-hidden="true">↗</b></button>)}</div> : <p className="atlas-inspect-empty-data">No connected links in the visible network.</p>}
        </details>}
        <details className="atlas-inspect-properties"><summary>Reported properties</summary>{(Array.isArray(record.properties) ? record.properties : []).map((property, index) => <div key={index}><span>{String(property.Property || '')}</span><strong>{String(property.Value ?? 'Unknown')} {String(property.Units || '')}</strong></div>)}</details>
      </>}
    </div>
  </div>;
}
