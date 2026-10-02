import React,{useEffect,useMemo,useRef,useState} from 'react';
import {capacityAtThreshold} from '../modelWorkspace/flowHistory';
import {selectedFlowSamples,flowResolutionLabel} from '../modelWorkspace/lolaFlowData';
import {fetchFlowHistory,flowHistoryKey,flowHistorySamples} from '../modelWorkspace/flowHistoryView';
import LolaParallelFlowChart from './LolaParallelFlowChart';
import LolaNearCapacityToggle from './LolaNearCapacityToggle';

export default function LolaFlowHistoryDock({context,scene,line,nearPercent=99,onChoosePeriod,connectionSelector,
  nearCapacity=false,onNearCapacityChange,nearCapacityDisabled=false,nearCapacityHelp}) {
  const [loadedHistory,setHistory]=useState(null),[status,setStatus]=useState({state:'idle'});
  const [animated,setAnimated]=useState(false),[collapsed,setCollapsed]=useState(false),[retry,setRetry]=useState(0);
  const cache=useRef(new Map()),controllerRef=useRef(null);
  const resolution=scene.selection.granularity;
  const key=flowHistoryKey(context.projectId,scene,line?.id);
  // Props change before effects run. Never render the old line's statistics
  // against the new line, even for that first render.
  const history=resolution==='year'?scene:loadedHistory?.key===key?loadedHistory.value:null;
  const sceneRef=useRef(scene);sceneRef.current=scene;
  const projectId=context.projectId, lineName=line?.name, lineId=line?.id;
  useEffect(()=>{
    const controller=new AbortController();controllerRef.current=controller;setHistory(null);
    const source=sceneRef.current;
    if(!lineName||source.selection.granularity==='year'){setStatus({state:'ready'});return()=>controller.abort();}
    if(cache.current.has(key)){setHistory({key,value:cache.current.get(key)});setStatus({state:'ready'});return()=>controller.abort();}
    setStatus({state:'loading',completed:0,total:0,phase:`Full-year ${flowResolutionLabel(resolution).toLowerCase()} history`});
    fetchFlowHistory({mode:'model',projectId},source,lineName,{signal:controller.signal,
      onProgress:value=>{if(!controller.signal.aborted)setStatus({state:'loading',...value});}})
      .then(value=>{if(controller.signal.aborted)return;cache.current.set(key,value);if(cache.current.size>3)cache.current.delete(cache.current.keys().next().value);setHistory({key,value});setStatus({state:'ready'});})
      .catch(error=>{if(!controller.signal.aborted)setStatus({state:'error',error:error.message});});
    return()=>controller.abort();
  },[key,projectId,lineName,retry]);
  const fallbackScene=history?null:scene;
  const samples=useMemo(()=>history?flowHistorySamples(history,lineId,nearPercent):selectedFlowSamples(fallbackScene,lineId),[history,lineId,fallbackScene,nearPercent]);
  const evidence=capacityAtThreshold(history?.stats?.get(lineId),nearPercent), chartLine=history?.lines.find(item=>item.id===lineId)||line;
  const hasLimits=samples.some(sample=>sample.valid>0||sample.maximumRatio!=null);
  return <section className={`lola-flow-history-dock ${collapsed?'is-collapsed':''}`} aria-label="Connection history">
    <header><div>{connectionSelector||<strong>{line?.name} · {scene.selection.period}</strong>}<span className="lola-flow-note" title={history?.warnings?.join('\n')}>{evidence?`${evidence.reportedHours.toLocaleString()} / ${evidence.expectedHours.toLocaleString()} reported hours`:history?`${samples.filter(sample=>sample.value!=null).length.toLocaleString()} / ${samples.length.toLocaleString()} reported periods`:''}
      {evidence&&evidence.expectedHours>evidence.validHours&&` · ${(evidence.expectedHours-evidence.reportedHours).toLocaleString()} missing · ${(evidence.reportedHours-evidence.validHours).toLocaleString()} without limits`}
      {evidence?.share!=null&&` · ${(evidence.share*100).toFixed(1)}% of hours ≥${nearPercent}% capacity`}</span></div>
      <div className="lola-history-actions"><span className="lola-history-resolution" aria-label="History resolution">{flowResolutionLabel(resolution)} · {scene.selection.propertyName} · {scene.unit}</span>
      <label><input aria-label="Animate chart transfers" type="checkbox" checked={animated} onChange={e=>setAnimated(e.target.checked)}/>Animate</label>
      <LolaNearCapacityToggle checked={nearCapacity} disabled={nearCapacityDisabled||!hasLimits} onChange={onNearCapacityChange}
        title={!hasLimits?'No compatible capacity limits for this connection’s history.':nearCapacityHelp}/>
      <button aria-label="History help" title="History uses the loaded Flow Explorer resolution, quantity and units. Summary periods are not hourly peaks. Gaps mean no data, not zero flow.">?</button>
      <button onClick={()=>setCollapsed(value=>!value)} aria-expanded={!collapsed}>{collapsed?'Expand history':'Collapse history'}</button></div></header>
    {!collapsed&&<>
      {!history&&status.state==='loading'&&<div className="lola-history-progress" role="status">Loading full-year history · {status.completed}/{status.total||'…'} · {status.phase}<progress value={status.completed} max={status.total||1}/><button onClick={()=>{controllerRef.current?.abort();setStatus({state:'cancelled'});}}>Cancel history load</button></div>}
      {!history&&['error','cancelled'].includes(status.state)&&<div role="alert">{status.error||'History load cancelled.'} <button onClick={()=>setRetry(value=>value+1)}>Retry history</button></div>}
      {!history&&<p className="lola-flow-note">Preview: {scene.periods.length} {flowResolutionLabel(resolution).toLowerCase()} map periods.</p>}
      <LolaParallelFlowChart key={`${lineId}:${Boolean(history)}:${resolution}`} line={chartLine} samples={samples} resolution={resolution} unit={history?.unit||scene.unit} direction={history?.direction||scene.direction}
        animated={animated} highlight={nearCapacity&&hasLimits} nearPercent={nearPercent} onChoosePeriod={history&&resolution!=='year'?onChoosePeriod:undefined}/>
    </>}
  </section>;
}
