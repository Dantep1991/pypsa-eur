import React,{useEffect,useMemo,useRef,useState} from 'react';
import {fetchFlowYear,hourlyEvidenceSelection,capacityAtThreshold} from '../modelWorkspace/flowHistory';
import {useWorkspaceAgentController} from '../agentWorkspace/react';
import {boolField,numberField} from '../agentWorkspace/registry';

export default function LolaCapacityEvidence({projectId,scene,onEvidence,nearPercent=99}) {
  const [status,setStatus]=useState({state:'idle'}),[threshold,setThreshold]=useState(5);
  const [evidence,setEvidence]=useState(null),[enabled,setEnabled]=useState(false);
  const controllerRef=useRef(null),cache=useRef(new Map());
  const key=JSON.stringify([projectId,scene.selection.modelVersion,scene.selection.runId,
    scene.selection.className,scene.selection.period,scene.selection.historyMetric,scene.lines.map(line=>line.id).sort()]);
  useEffect(()=>{
    controllerRef.current?.abort();setEvidence(cache.current.get(key)||null);setEnabled(false);setStatus({state:'idle'});onEvidence(null);
    return()=>controllerRef.current?.abort();
  },[key,onEvidence]);
  const stats=useMemo(()=>evidence?new Map([...evidence.stats].map(([id,item])=>[id,capacityAtThreshold(item,nearPercent)])):null,[evidence,nearPercent]);
  useEffect(()=>onEvidence(enabled&&stats?{stats,threshold:threshold/100}:null),[enabled,stats,threshold,onEvidence]);
  const calculate=async()=>{
    controllerRef.current?.abort();const controller=new AbortController();controllerRef.current=controller;
    setStatus({state:'loading',completed:0,total:0});
    try {
      const result=await fetchFlowYear({projectId},scene,scene.lines.filter(line=>line.coordinates?.length===2).map(line=>line.name),{
        signal:controller.signal,collect:false,onProgress:progress=>{if(!controller.signal.aborted)setStatus({state:'loading',...progress});}});
      if(!controller.signal.aborted){cache.current.set(key,result);if(cache.current.size>3)cache.current.delete(cache.current.keys().next().value);setEvidence(result);setEnabled(true);setStatus({state:'ready'});}
    } catch(error){if(!controller.signal.aborted)setStatus({state:'error',error:error.message});}
  };
  const available=hourlyEvidenceSelection(scene);
  const values=stats?[...stats.values()]:[];
  const cancel=()=>{controllerRef.current?.abort();setStatus({state:'cancelled'});};
  useWorkspaceAgentController('flow_capacity',{
    ready:true,
    fields:{enabled:boolField('Colour map by hours near capacity'),threshold:numberField('Highlight percentage of comparable hours',0,100)},
    actions:{calculate:{description:'Start the full-year capacity-hours calculation. Returns immediately with actual progress; do not claim it has finished until state is ready.'},
      configure:{description:'Change colouring or the threshold using completed hourly evidence; no reread.'},cancel:{description:'Cancel capacity analysis without applying partial evidence.'}},
    state:{status:status.state,progress:status.state==='loading'?status:null,error:status.error,
      available:Boolean(available),evidence:Boolean(evidence),enabled,threshold,nearPercent,
      highlighted:values.filter(item=>item.share!=null&&item.share>=threshold/100).length,connections:values.length},
  },async(action,updates)=>{
    if(action==='cancel'){cancel();return 'Capacity analysis cancelled.';}
    if(updates.enabled===true&&!evidence)throw new Error('Calculate capacity hours before enabling its map colours.');
    if(updates.enabled!=null)setEnabled(updates.enabled);
    if(updates.threshold!=null)setThreshold(updates.threshold);
    if(action==='calculate'){
      if(!available)throw new Error('No compatible hourly quantity is registered for this selection.');
      if(evidence){setEnabled(true);return 'Cached capacity hours shown.';}
      if(status.state!=='loading')calculate();
      return 'Calculating capacity hours. Progress is shown in Capacity.';
    }
    return 'Capacity display updated.';
  });
  return <div className="lola-capacity-analysis">
    <p className="lola-flow-note">Full-year hours near capacity, across all mapped connections. First calculation may take several minutes; results are reused in this session.</p>
    {!evidence&&<button className="lola-flow-primary" disabled={!available||status.state==='loading'} onClick={calculate}>Calculate capacity hours</button>}
    {status.state==='loading'&&<div role="status" className="lola-capacity-progress"><span>{status.completed}/{status.total||'…'} windows · {status.phase}</span><progress max={status.total||1} value={status.completed||0}/><button onClick={cancel}>Cancel capacity analysis</button></div>}
    {status.state==='error'&&<p role="alert">{status.error}</p>}
    {status.state==='cancelled'&&<p>Cancelled. No partial result applied.</p>}
    {!available&&<p>No compatible hourly quantity is registered for this selection.</p>}
    {evidence&&<><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Colour map by hours near capacity</label>
      <label>Highlight when ≥ % of comparable hours<input aria-label="Capacity hours threshold" type="number" min="0" max="100" step="1" value={threshold} onChange={e=>setThreshold(Math.min(100,Math.max(0,Number(e.target.value))))}/></label>
      <p>{values.filter(item=>item.share!=null&&item.share>=threshold/100).length} of {values.length} connections highlighted.</p></>}
    <p className="lola-flow-note" title="Uses this run’s directional Export Limit / Import Limit results. Missing limits remain unknown; annual net utilisation is a different measure.">Orange = threshold met · grey = unknown ⓘ</p>
    {evidence?.warnings?.length>0&&<p className="lola-flow-note" title={evidence.warnings.join('\n')}>Incomplete coverage — see line tooltips.</p>}
  </div>;
}
