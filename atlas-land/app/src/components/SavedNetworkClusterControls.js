import React from 'react';
export default function SavedNetworkClusterControls({ schemes, active, onChange, onExpandGroup, warnings = [], busy }) {
  if (!schemes.length && !active) return null;
  return <div className="mt-3 space-y-2 rounded-xl border border-white/15 p-3">
    <label className="block text-[11px]">Manual network grouping
      <select className="w-full rounded-lg border border-white/15 bg-transparent p-2 text-[11px]"
        aria-label="Manual network grouping" value={active?.id || ''} disabled={busy}
        onChange={e => onChange(schemes.find(s => s.id === e.target.value) || null)}>
        <option value="">Native detail (no manual grouping)</option>
        {active && !schemes.some(s=>s.id===active.id) && <option value={active.id}>Preview · {active.groups.length} groups</option>}
        {schemes.map(s => <option value={s.id} key={s.id}>{s.name} · {s.groupCount ?? s.groups?.length} groups</option>)}
      </select>
    </label>
    {active?.groups?.length > 0 && <p className="text-[10px]" role="status">{active.groups.length} saved groups · {active.groups.reduce((sum,g) => sum + g.members.length,0)} source buses</p>}
    {active && <button className="w-full rounded-lg border border-white/15 p-2 text-[11px]" type="button" onClick={() => onChange(null)}>Expand original detail</button>}
    {active?.groups?.length && onExpandGroup && <details>
      <summary className="text-[11px]">Expand individual groups</summary>
      <div className="max-h-40 overflow-y-auto">{active.groups.map(g => <label key={g.id} className="flex gap-2 text-[10px]">
        <input type="checkbox" disabled={g.geographyOnly} checked={(active.expandedGroupIds || []).includes(g.id)} onChange={e => onExpandGroup(g.id,e.target.checked)} />
        {g.name} · {g.geographyOnly?'Geography only':`${g.members.length} buses`}
      </label>)}</div>
    </details>}
    {warnings.map((warning,i) => <p className="text-[10px]" role="status" key={i}>{warning}</p>)}
  </div>;
}
