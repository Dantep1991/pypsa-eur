import React, {useState} from 'react';
import NetworkClusteringControls from './NetworkClusteringControls';
import RegionalClusteringControls from './RegionalClusteringControls';
import EurostatGrowthControls from './EurostatGrowthControls';

export default function RegionalClusteringWorkspace({countryCodes,onOverlayChange,onClearAggregation,...networkProps}) {
  const [tab,setTab]=useState('growth');
  const [growthRequest,setGrowthRequest]=useState(null);
  const [growthBusy,setGrowthBusy]=useState(false);
  const changeTab=value=>{onOverlayChange?.(null);onClearAggregation?.();setTab(value);setGrowthRequest(null);setGrowthBusy(false);};
  return <>
    <div className="mb-3 grid grid-cols-3 gap-1" role="tablist" aria-label="Regional clustering method">
      {[['growth','Eurostat regions'],['geography','Geographic regions'],['typology','Regional typology']].map(([id,label])=>
        <button type="button" key={id} role="tab" aria-selected={tab===id} onClick={()=>changeTab(id)}
          className={`rounded-lg border p-2 text-[10px] ${tab===id?'border-tj-gold/40 bg-tj-gold text-tj-navy-dark':'border-white/15 bg-transparent'}`}>{label}</button>)}
    </div>
    {tab==='growth'&&<div role="tabpanel" aria-label="Eurostat regions">
      <EurostatGrowthControls countries={networkProps.countries} busy={growthBusy||networkProps.busy}
        onBuild={settings=>setGrowthRequest({settings,id:Date.now()})}/>
      <NetworkClusteringControls key="growth" {...networkProps} compactBuilder growthRequest={growthRequest} onBusyChange={setGrowthBusy}/>
    </div>}
    {tab==='geography'&&<div role="tabpanel" aria-label="Geographic regions"><NetworkClusteringControls key="geography" {...networkProps}/></div>}
    {tab==='typology'&&<div role="tabpanel" aria-label="Regional typology">
      <p className="mb-2 text-[10px]">Similarity classes, not contiguous geographic regions. Only complete Eurostat records are shown.</p>
      <RegionalClusteringControls countryCodes={countryCodes} onOverlayChange={onOverlayChange}/>
    </div>}
  </>;
}
