import React from 'react';

// One published-region picker for uniform and mixed model projections.
export default function ModelRegionalSelection({ catalog, countries, schemeId, regionIds, onChange, busy, mixed = false }) {
  const schemes = catalog?.regional_registry?.schemes || [];
  const scheme = schemes.find(item => item.id === schemeId) || schemes[0];
  const chosen = scheme?.regions.filter(region => regionIds.includes(region.id)) || [];
  return <>
    <select aria-label={mixed ? 'Mixed regional scheme' : 'Regional scheme'} value={scheme?.id || ''}
      disabled={busy} className="w-full rounded-lg border border-white/10 bg-transparent p-2 text-[11px]"
      onChange={event => onChange({ schemeId: event.target.value, regionIds: [] })}>
      {schemes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
    </select>
    <div className="space-y-1" aria-label={mixed ? 'Mixed published regions' : 'Published regions'}>{scheme?.regions.map(region => {
      const present = region.countries.filter(country => countries.includes(country));
      return <label key={region.id} className={`flex gap-2 text-[10px] ${!present.length ? 'opacity-50' : ''}`}>
        <input type="checkbox" checked={regionIds.includes(region.id)} disabled={!present.length || busy}
          onChange={event => onChange({ schemeId: scheme.id, regionIds: event.target.checked
            ? [...regionIds, region.id] : regionIds.filter(id => id !== region.id) })} />
        <span>{region.name} <span className="text-tj-slate">({present.length})</span></span>
      </label>;
    })}</div>
    <small>{mixed ? 'Only Regional levels are grouped. Other levels stay unchanged; unselected countries stay separate.'
      : 'Overlapping selections combine on the map; each country appears once.'}</small>
    <details className="text-[9px] text-tj-slate"><summary>Membership & sources</summary>{chosen.map(region => <p key={region.id} className="mt-1">
      {region.name}: {region.countries.filter(country => countries.includes(country)).join(', ')} · {region.edition} · <a href={region.source_url} target="_blank" rel="noreferrer">Source</a></p>)}</details>
  </>;
}
