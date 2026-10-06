import React,{useEffect,useMemo,useRef,useState} from 'react';
import {capacityAtThreshold} from '../modelWorkspace/flowHistory';
import {selectedFlowSamples,flowResolutionLabel} from '../modelWorkspace/lolaFlowData';
import {fetchFlowHistory,flowHistoryKey} from '../modelWorkspace/flowHistoryView';
import LolaParallelFlowChart from './LolaParallelFlowChart';
import LolaNearCapacityToggle from './LolaNearCapacityToggle';
import {aggregateFlowHistory,historyAggregationMethod,historyAggregationResolutions} from '../modelWorkspace/flowHistoryAggregation';
import {useWorkspaceAgentController} from '../agentWorkspace/react';
import {boolField,enumField} from '../agentWorkspace/registry';

export default function LolaFlowHistoryDock({context,scene,line,nearPercent=99,onChoosePeriod,connectionSelector,
  nearCapacity=false,onNearCapacityChange,nearCapacityDisabled=false,nearCapacityHelp,animated=false,onAnimatedChange,animationSpeed,
  activePeriod,onInspectPeriod,linkedResolution,onResolutionChange,availableResolutions,loading=false}) {
  const [loadedHistory,setHistory]=useState(null),[status,setStatus]=useState({state:'idle'});
  const [collapsed,setCollapsed]=useState(false),[retry,setRetry]=useState(0);
  const cache=useRef(new Map()),controllerRef=useRef(null);
  const resolution=scene.selection.granularity;
  const aggregationKey=JSON.stringify([context.projectId,scene.selection.modelVersion,scene.selection.runId,resolution,scene.unit]);
  const [aggregation,setAggregation]=useState(null);
  const displayResolution=onResolutionChange?resolution:aggregation?.key===aggregationKey?aggregation.resolution:resolution;
  const changeResolution=value=>onResolutionChange?onResolutionChange(value):setAggregation({key:aggregationKey,resolution:value});
  const key=flowHistoryKey(context.projectId,scene,line?.id);
  // Props change before effects run. Never render the old line's statistics
  // against the new line, even for that first render.
  const history=resolution==='year'?scene:loadedHistory?.key===key?loadedHistory.value:null;
  const choices=onResolutionChange?availableResolutions:historyAggregationResolutions(history||scene);
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
  const samples=useMemo(()=>history?aggregateFlowHistory(history,lineId,displayResolution,nearPercent):selectedFlowSamples(fallbackScene,lineId),[history,lineId,fallbackScene,nearPercent,displayResolution]);
  const evidence=capacityAtThreshold(history?.stats?.get(lineId),nearPercent), chartLine=history?.lines.find(item=>item.id===lineId)||line;
  const hasLimits=samples.some(sample=>sample.valid>0||sample.maximumRatio!=null);
  const cancel=()=>{controllerRef.current?.abort();setStatus({state:'cancelled'});};
  useWorkspaceAgentController('flow_history',{
    ready:true,
    fields:{resolution:enumField('Shared flow time resolution',choices),collapsed:boolField('Collapse connection history')},
    actions:{configure:{description:'Aggregate already loaded history or expand/collapse it. Missing observations remain unknown.'},
      cancel:{description:'Cancel the full-year history read.'},retry:{description:'Retry full-year history and report progress, not completion.'}},
    state:{resolution:linkedResolution||displayResolution,collapsed,status:status.state,loaded:Boolean(history),lineId,
      periods:samples.length,progress:status.state==='loading'?status:null,error:status.error,aggregationMethod:historyAggregationMethod(scene.unit)},
  },async(action,updates)=>{
    if(action==='cancel'){cancel();return 'History load cancelled.';}
    if(action==='retry'){setRetry(value=>value+1);return 'Reloading connection history.';}
    if(updates.resolution!=null){
      if(!history&&!onResolutionChange)throw new Error('Connection history is still loading. Its progress is shown below the map.');
      changeResolution(updates.resolution);
    }
    if(updates.collapsed!=null)setCollapsed(updates.collapsed);
    return 'Connection history updated.';
  });
  return <section className={`lola-flow-history-dock ${collapsed?'is-collapsed':''}`} aria-label="Connection history">
    <header><div>{connectionSelector||<strong>{line?.name} · {scene.selection.period}</strong>}<span className="lola-flow-note" title={history?.warnings?.join('\n')}>{evidence?`${evidence.reportedHours.toLocaleString()} / ${evidence.expectedHours.toLocaleString()} reported hours`:history?`${samples.filter(sample=>sample.value!=null).length.toLocaleString()} / ${samples.length.toLocaleString()} reported periods`:''}
      {evidence&&evidence.expectedHours>evidence.validHours&&` · ${(evidence.expectedHours-evidence.reportedHours).toLocaleString()} missing · ${(evidence.reportedHours-evidence.validHours).toLocaleString()} without limits`}
      {evidence?.share!=null&&` · ${(evidence.share*100).toFixed(1)}% of hours ≥${nearPercent}% capacity`}</span></div>
      <div className="lola-history-actions"><label>Time resolution<select aria-label="History aggregation" value={linkedResolution||displayResolution} disabled={loading||(!history&&!onResolutionChange)}
        onChange={event=>changeResolution(event.target.value)}>
        {choices.map(value=><option key={value} value={value}>{flowResolutionLabel(value)}</option>)}
      </select></label><span className="lola-history-resolution" aria-label="History resolution">{flowResolutionLabel(displayResolution)} · {displayResolution!==resolution?(historyAggregationMethod(scene.unit)==='mean'?'Mean ':'Total '):''}{scene.selection.propertyName} · {scene.unit}</span>
      <label><input aria-label="Animate chart transfers" type="checkbox" checked={animated} onChange={e=>onAnimatedChange?.(e.target.checked)}/>Animate</label>
      <LolaNearCapacityToggle checked={nearCapacity} disabled={nearCapacityDisabled||!hasLimits} onChange={onNearCapacityChange}
        title={!hasLimits?'No compatible capacity limits for this connection’s history.':nearCapacityHelp}/>
      <button aria-label="History help" title={onResolutionChange?'Map and history share the selected time resolution and inspected period. Native power/energy units are preserved; missing observations remain unknown.':'Aggregate loaded history without rereading results. Power is averaged; energy is summed. Missing periods are not zero.'}>?</button>
      <button onClick={()=>setCollapsed(value=>!value)} aria-expanded={!collapsed}>{collapsed?'Expand history':'Collapse history'}</button></div></header>
    {!collapsed&&<>
      {!history&&status.state==='loading'&&<div className="lola-history-progress" role="status">Loading full-year history · {status.completed}/{status.total||'…'} · {status.phase}<progress value={status.completed} max={status.total||1}/><button onClick={cancel}>Cancel history load</button></div>}
      {!history&&['error','cancelled'].includes(status.state)&&<div role="alert">{status.error||'History load cancelled.'} <button onClick={()=>setRetry(value=>value+1)}>Retry history</button></div>}
      {!history&&<p className="lola-flow-note">Preview: {scene.periods.length} {flowResolutionLabel(resolution).toLowerCase()} map periods.</p>}
      <LolaParallelFlowChart key={`${lineId}:${Boolean(history)}:${displayResolution}`} line={chartLine} samples={samples} resolution={history?displayResolution:resolution} unit={history?.unit||scene.unit} direction={history?.direction||scene.direction}
        activePeriod={activePeriod} onInspectPeriod={onInspectPeriod}
        aggregated={Boolean(history&&displayResolution!==resolution)} animated={animated} animationSpeed={animationSpeed} highlight={nearCapacity&&hasLimits} nearPercent={nearPercent} onChoosePeriod={resolution!=='year'?onChoosePeriod:undefined}/>
    </>}
  </section>;
}
