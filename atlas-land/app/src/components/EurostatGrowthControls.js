import React, {useState} from 'react';
import {EUROSTAT_INDICATORS} from './RegionalClusteringControls';

const inputClass='w-full rounded-lg border border-white/15 bg-transparent p-2 text-[11px]';
export default function EurostatGrowthControls({countries=[],busy,onBuild}) {
  const [level,setLevel]=useState('nuts3');
  const [year,setYear]=useState(2023);
  const [count,setCount]=useState(10);
  const [selected,setSelected]=useState(['density']);
  const [weights,setWeights]=useState({density:1,gdp:1,employment:1,unemployment:1});
  const [scaling,setScaling]=useState('zscore');
  const [influence,setInfluence]=useState(1);
  const changeLevel=value=>{
    setLevel(value);
    setSelected(current=>current.filter(k=>EUROSTAT_INDICATORS.find(i=>i.key===k).levels.includes(Number(value.slice(-1)))));
  };
  return <div className="space-y-3" data-testid="eurostat-growth-controls">
    <p className="text-[11px]">Evidence-ranked seeds grow around connected source-grid cores.</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px]">Source regions<select className={inputClass} aria-label="Growth region level" value={level} disabled={busy} onChange={e=>changeLevel(e.target.value)}>
        <option value="nuts3">NUTS 3</option><option value="nuts2">NUTS 2</option>
      </select></label>
      <label className="text-[11px]">Reference year<select className={inputClass} aria-label="Growth reference year" value={year} disabled={busy} onChange={e=>setYear(Number(e.target.value))}>
        {[2023,2022,2021].map(y=><option key={y} value={y}>{y}</option>)}
      </select></label>
    </div>
    <fieldset className="space-y-2" disabled={busy}><legend className="text-[11px]">Eurostat evidence</legend>
      {EUROSTAT_INDICATORS.map(i=><label key={i.key} className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-[11px]">
        <input type="checkbox" aria-label={`Growth ${i.label}`} checked={selected.includes(i.key)} disabled={!i.levels.includes(Number(level.slice(-1)))}
          onChange={e=>setSelected(current=>e.target.checked?[...current,i.key]:current.filter(k=>k!==i.key))}/>
        <span className="flex-1">{i.label}<small className="block text-[9px]">{i.unit}</small></span>
        {selected.includes(i.key)&&<select className="rounded border border-white/15 bg-transparent p-1" aria-label={`Growth ${i.label} weight`} value={weights[i.key]} onChange={e=>setWeights(current=>({...current,[i.key]:Number(e.target.value)}))}>
          {[.5,1,2,4].map(w=><option key={w} value={w}>{w}×</option>)}
        </select>}
      </label>)}
    </fieldset>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[11px]">Clusters<input type="number" className={inputClass} aria-label="Growth cluster count" min="1" max="2048" value={count} disabled={busy}
        onChange={e=>setCount(Math.max(1,Math.min(2048,Math.trunc(Number(e.target.value))||1)))}/></label>
      <label className="text-[11px]">Scaling<select className={inputClass} aria-label="Growth scaling" value={scaling} disabled={busy} onChange={e=>setScaling(e.target.value)}>
        <option value="zscore">Z-score</option><option value="robust">Robust IQR</option>
      </select></label>
    </div>
    <label className="block text-[11px]">Evidence influence on boundaries<select className={inputClass} aria-label="Growth evidence influence" value={influence} disabled={busy} onChange={e=>setInfluence(Number(e.target.value))}>
      <option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option>
    </select></label>
    <button type="button" disabled={busy||!countries.length||!selected.length} className="w-full rounded-lg border border-tj-gold/40 bg-tj-gold p-2 text-[11px] font-semibold text-tj-navy-dark disabled:opacity-40"
      onClick={()=>onBuild({regionLevel:level,clusters:count,evidence:{year,indicators:selected,weights:Object.fromEntries(selected.map(k=>[k,weights[k]])),scaling,evidenceInfluence:influence}})}>
      {busy?'Building geographic regions…':'Build Eurostat regions'}
    </button>
    <details className="text-[10px]"><summary>How boundaries are decided</summary>
      <p>Density ranks density, not total population. Seeds reserve real connected grid cores; incompatible neighbouring seeds move down the evidence ranking. Grid-bearing regions grow through reported source branches, with distance and weighted Eurostat similarity deciding boundaries. Empty land is included without empty electrical nodes. Every source bus remains traceable. No lines are invented. This checks topology, not calculated grid capacity or internal bottlenecks.</p>
    </details>
  </div>;
}
