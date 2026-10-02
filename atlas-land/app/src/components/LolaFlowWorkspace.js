import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchModelResultCatalog } from '../modelWorkspace/resultScene';
import { fetchLolaFlowScene, fetchLolaFlowTopology, flowMetricContract, FLOW_RESOLUTIONS, flowResolutionLabel,
  lolaFlowFrame, flowUtilisation } from '../modelWorkspace/lolaFlowData';
import { RESULT_SERIES_COLORS } from '../modelWorkspace/resultColors';
import LolaFlowHistoryDock from './LolaFlowHistoryDock';
import LolaNearCapacityToggle from './LolaNearCapacityToggle';
import LolaCapacityEvidence from './LolaCapacityEvidence';
import LolaFlowQualityNotice from './LolaFlowQualityNotice';
import './LolaFlowWorkspace.css';
import { withAnnualNetFlow } from '../modelWorkspace/annualFlow';
import { flowPeriodMetrics, flowMetricsLabel } from '../modelWorkspace/flowPeriodMetrics';
import { historyPeriodSelection } from '../modelWorkspace/flowHistoryView';

function flowViewLabel(selection = {}) {
  return [selection.className, selection.propertyName, selection.category || 'All model categories',
    selection.period, flowResolutionLabel(selection.granularity)].filter(Boolean).join(' · ');
}

export default function LolaFlowWorkspace({ context, modelVersion, selectedId, onSelect, onFrame, onClose }) {
  const [catalog, setCatalog] = useState(null);
  const [choice, setChoice] = useState({});
  const [status, setStatus] = useState({ state: 'catalog', completed: 0, total: 0 });
  const [scene, setScene] = useState(null);
  const [index, setIndex] = useState(0);
  const [category, setCategory] = useState('');
  const [animated, setAnimated] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [nearCapacity, setNearCapacity] = useState(false);
  const [nearPercent,setNearPercent] = useState(99);
  const [capacityEvidence,setCapacityEvidence] = useState(null);
  const [tab, setTab] = useState('data');
  const [topology, setTopology] = useState(null);
  const [topologyStatus, setTopologyStatus] = useState({ state: 'idle' });
  const queryRef = useRef(null);
  const projectId = context?.projectId;
  useEffect(() => {
    const controller = new AbortController();
    setCatalog(null); setScene(null); setChoice({}); setPlaying(false);
    setStatus({ state: 'catalog', completed: 0, total: 0 });
    onFrame(null);
    fetchModelResultCatalog({ mode: 'model', projectId }, modelVersion, {
      signal: controller.signal,
      onProgress: progress => { if (!controller.signal.aborted) setStatus({ state: 'catalog', ...progress }); },
    }).then(result => {
      if (!controller.signal.aborted) { setCatalog(result); setStatus({ state: 'idle' }); }
    }).catch(error => {
      if (!controller.signal.aborted) setStatus({ state: 'error', error: error.message });
    });
    return () => { controller.abort(); queryRef.current?.abort(); };
  }, [projectId, modelVersion, onFrame]);

  const runs = (catalog?.runs || []).filter(run => run.compatible && run.quantities.some(flowMetricContract));
  const run = runs.find(item => item.run_id === choice.runId) || runs[0];
  const quantities = withAnnualNetFlow((run?.quantities || []).filter(flowMetricContract));
  const requestedQuantity = quantities.find(item => item.id === choice.quantityId)
    || quantities.find(item => item.id === 'Line.Flow') || quantities[0];
  const resolutionQuantity = requestedQuantity?.class_name === 'Line' && requestedQuantity.property_name === 'Net Flow'
    ? quantities.find(item => item.class_name === 'Line' && item.property_name === 'Flow') : requestedQuantity;
  const resolutions = FLOW_RESOLUTIONS.filter(value => requestedQuantity?.available_granularities.includes(value)
    || resolutionQuantity?.available_granularities.includes(value));
  const granularity = resolutions.includes(choice.granularity) ? choice.granularity : resolutions[0];
  const quantity = requestedQuantity?.class_name === 'Line' && granularity === 'year'
    ? quantities.find(item => item.class_name === 'Line' && item.property_name === 'Net Flow'
      && item.available_granularities.includes('year') && item.report_family === requestedQuantity.report_family) || requestedQuantity
    : requestedQuantity?.available_granularities.includes(granularity) ? requestedQuantity : resolutionQuantity;
  const year = choice.period || quantity?.periods?.[0] || run?.periods?.[0] || '';
  const historyQuantity = quantity?.property_name === 'Net Flow'
    ? quantities.find(item => item.class_name === quantity.class_name && item.property_name === 'Flow'
      && item.report_family === quantity.report_family) : quantity;
  const selection = {
    runId: run?.run_id, runModelVersion: run?.result_model_version, modelVersion,
    className: flowMetricContract(quantity)?.className, propertyName: quantity?.property_name,
    reportFamily: quantity?.report_family, unit: quantity?.units_by_granularity?.[granularity] || quantity?.unit, granularity,
    derivedNetFlow: Boolean(quantity?.derived_net_flow),
    historyMetric: historyQuantity && { propertyName: historyQuantity.property_name, reportFamily: historyQuantity.report_family,
      unit: historyQuantity.unit, unitsByGranularity: historyQuantity.units_by_granularity,
      availableGranularities: historyQuantity.available_granularities,
      limitProperties: (run?.quantities || []).filter(item => item.class_name === 'Line'
        && ['Export Limit','Import Limit'].includes(item.property_name)
        && item.available_granularities.includes('hour')).map(item => item.property_name) },
    limitProperties: (run?.quantities || []).filter(item => item.class_name === 'Line'
      && ['Export Limit', 'Import Limit'].includes(item.property_name)
      && item.available_granularities.includes(granularity)).map(item => item.property_name),
    availableGranularities: resolutions, period: year,
    dateFrom: choice.dateFrom || (year ? `${year}-01-01` : ''),
    dateTo: choice.dateTo || (year ? `${year}-${granularity === 'hour' ? '01-01' : granularity === 'day' ? '01-07' : '12-31'}` : ''),
    category: choice.category ?? topology?.default_category ?? '',
  };
  const className = selection.className;
  useEffect(() => {
    if (!className) return undefined;
    const controller = new AbortController();
    setTopology(null); setTopologyStatus({ state: 'loading' });
    fetchLolaFlowTopology({ projectId }, { modelVersion, className, period: year }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setTopology(value); setTopologyStatus({ state: 'ready' }); } })
      .catch(error => { if (!controller.signal.aborted) setTopologyStatus({ state: 'error', error: error.message }); });
    return () => controller.abort();
  }, [projectId, modelVersion, className, year]);
  const requestKey = JSON.stringify(selection);
  useEffect(() => {
    setPlaying(false);
    setStatus(previous => previous.state === 'error' && previous.requestKey && previous.requestKey !== requestKey
      ? { state: 'idle' } : previous);
  }, [requestKey]);

  const visibleScene = useMemo(() => scene && ({ ...scene,
    lines: category ? scene.lines.filter(line => line.category === category) : scene.lines }), [scene, category]);
  const selectedLine = visibleScene?.lines.find(line => line.id === selectedId) || visibleScene?.lines[0];
  const annual = scene?.selection.granularity === 'year';
  const net = scene?.selection.propertyName === 'Net Flow';
  const selectedMetrics = selectedLine && flowPeriodMetrics(selectedLine, selectedLine.values.get(scene.periods[index]),
    scene.unit, scene.selection.granularity, scene.direction, scene.periods[index]);
  const hasLimits = visibleScene?.lines.some(line => scene.periods.some(period => {
    const value = line.values.get(period);
    return value != null && flowUtilisation(line, value, scene.unit, scene.selection.granularity, scene.direction, period) != null;
  }));
  const nearCapacityDisabled=!hasLimits||Boolean(capacityEvidence);
  const nearCapacityActive=nearCapacity&&!nearCapacityDisabled;
  const nearCapacityHelp=capacityEvidence?'Turn off capacity-hours map colouring to highlight the loaded periods near capacity.'
    :annual?'Annual net utilisation, not hourly congestion.':'Flow divided by its reported directional limit.';
  const annualRatios=annual?(visibleScene?.lines||[]).filter(line=>line.coordinates?.length>=2).map(line=>
    flowUtilisation(line,line.values.get(scene.periods[index]),scene.unit,'year',scene.direction,scene.periods[index])).filter(value=>value!=null):[];
  useEffect(() => {
    if (!scene) return;
    const frame = lolaFlowFrame(visibleScene, scene.periods[index], selectedId, RESULT_SERIES_COLORS[0]);
    if (nearCapacityActive) frame.lines = frame.lines.map(line => {
      const utilisation = flowUtilisation(line, line.value, scene.unit, scene.selection.granularity, scene.direction, scene.periods[index]);
      return { ...line, utilisation, color: utilisation != null && utilisation >= nearPercent/100 ? RESULT_SERIES_COLORS[2] : RESULT_SERIES_COLORS[0] };
    });
    if (capacityEvidence) frame.lines=frame.lines.map(line=>{
      const evidence=capacityEvidence.stats.get(line.id);
      return {...line,capacityEvidence:evidence,color:evidence?.share==null?RESULT_SERIES_COLORS[7]
        :evidence.share>=capacityEvidence.threshold?RESULT_SERIES_COLORS[2]:RESULT_SERIES_COLORS[0]};
    });
    onFrame({ ...frame, maximum: scene.maximum, animated });
  }, [scene, visibleScene, index, selectedId, animated, nearCapacityActive, capacityEvidence, nearPercent, onFrame]);
  useEffect(() => {
    if (!playing || !scene || scene.periods.length < 2) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex(value => (value + 1) % scene.periods.length);
    }, 800);
    return () => clearInterval(timer);
  }, [playing, scene]);
  const load = async (conflictPolicy = 'reject', requested = selection, selectedPeriod = null) => {
    queryRef.current?.abort();
    const controller = new AbortController(); queryRef.current = controller;
    setPlaying(false); setStatus({ state: 'loading', phase: 'topology', completed: 0, total: 3 });
    try {
      const next = await fetchLolaFlowScene({ mode: 'model', projectId }, requested, {
        signal: controller.signal, topology, conflictPolicy,
        onProgress: progress => { if (!controller.signal.aborted) setStatus({ state: 'loading', ...progress }); },
      });
      if (controller.signal.aborted) return;
      setScene(next); setIndex(Math.max(0,next.periods.findIndex(period => Date.parse(period) === Date.parse(selectedPeriod)))); setCategory(''); setNearCapacity(false);
      setTab('time');
      if (!selectedPeriod) onSelect(''); setStatus({ state: 'ready' });
    } catch (error) {
      if (!controller.signal.aborted) setStatus({ state: 'error', error: error.message, requested,
        requestKey, code: error.code, quality: error.quality });
    }
  };
  const change = (key, value) => setChoice(previous => ({ ...previous, [key]: value }));
  const showHistoryPeriod = period => {
    const requested = historyPeriodSelection(scene,period);
    setChoice({runId:requested.runId,quantityId:`${requested.className}.${requested.propertyName}`,
      period:requested.period,granularity:requested.granularity,category:requested.category,dateFrom:requested.dateFrom,dateTo:requested.dateTo});
    load('reject',requested,period);
  };
  const categories = [...new Set(scene?.lines.map(line => line.category).filter(Boolean))];
  const busy = ['loading', 'catalog'].includes(status.state) || topologyStatus.state === 'loading';
  const settingsDiffer = scene && ['runId', 'className', 'propertyName', 'period', 'granularity', 'category', 'dateFrom', 'dateTo']
    .some(key => (scene.selection[key] || '') !== (selection[key] || ''));
  return <><section className="lola-flow-workspace" aria-label="Lola flow workspace">
    <header><div><span className="lola-flow-eyebrow">LOLA · FLOW VISUALISATION</span><h2>Flow explorer</h2></div>
      <button type="button" onClick={onClose} aria-label="Close flow workspace">×</button></header>
    <nav className="lola-flow-tabs" role="tablist" aria-label="Flow explorer sections">
      {[['data','Data'],['time','Time & display'],['capacity','Capacity']].map(([id,label])=><button key={id} role="tab" id={`flow-tab-${id}`} aria-controls={`flow-panel-${id}`} aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
    </nav>
    <div className="lola-flow-content">
      <section className="lola-flow-card" role="tabpanel" id="flow-panel-data" aria-labelledby="flow-tab-data" hidden={tab!=='data'}>
      <div className="lola-flow-controls">
        <label>Result run<select aria-label="Flow result run" value={run?.run_id || ''} disabled={busy || !runs.length}
          onChange={event => { setChoice({ runId: event.target.value }); }}>
          {runs.map(item => <option key={item.run_id} value={item.run_id}>{item.label}</option>)}
        </select></label>
        <label>Connection / quantity<select aria-label="Flow quantity" value={quantity?.id || ''} disabled={busy || !quantities.length}
          onChange={event => setChoice(previous => ({ ...previous, quantityId: event.target.value, category: undefined }))}>
          {quantities.filter(item => granularity !== 'year' || quantity?.property_name !== 'Net Flow'
            || item.class_name !== 'Line' || item.property_name === 'Net Flow').map(item => <option key={item.id} value={item.id}>{item.class_name} · {item.property_name} ({item.units_by_granularity?.[granularity] || item.unit})</option>)}
        </select></label>
        <label>Year<select aria-label="Flow year" value={year} disabled={busy}
          onChange={event => setChoice(previous => ({ ...previous, period: event.target.value, dateFrom: '', dateTo: '' }))}>
          {(quantity?.periods || []).map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Model category<select aria-label="Flow model category" value={selection.category} disabled={busy}
          onChange={event => change('category', event.target.value)}><option value="">All categories</option>
          {[...new Set(topology?.lines.map(line => line.category).filter(Boolean))].map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      </section>
      <section className="lola-flow-card" role="tabpanel" id="flow-panel-time" aria-labelledby="flow-tab-time" hidden={tab!=='time'}>
        <div className="lola-flow-controls">
        <label>Time resolution<select aria-label="Flow time resolution" value={granularity || ''} disabled={busy || !resolutions.length}
          onChange={event => setChoice(previous => ({ ...previous, granularity: event.target.value, dateFrom: '', dateTo: '' }))}>
          {resolutions.map(value => <option key={value} value={value}>{flowResolutionLabel(value)}</option>)}
        </select></label>
        {granularity !== 'year' && <>
          <label>From<input aria-label="Flow start date" type="date" disabled={busy} value={selection.dateFrom} onChange={event => change('dateFrom', event.target.value)} /></label>
          <label>To<input aria-label="Flow end date" type="date" disabled={busy} value={selection.dateTo} onChange={event => change('dateTo', event.target.value)} /></label>
        </>}
        </div>
        <div className="lola-flow-play-actions" hidden={!scene || scene.periods.length < 2}>
          <button type="button" disabled={!scene || scene.periods.length < 2 || busy || settingsDiffer} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play timeline'}</button></div>
        {scene && scene.periods.length>1 && <div className="lola-flow-timeline">
          <input aria-label="Flow period" type="range" min="0" max={Math.max(0, scene.periods.length - 1)} value={index} disabled={scene.periods.length < 2} onChange={event => { setPlaying(false); setIndex(Number(event.target.value)); }} />
          <output>{annual ? scene.periods[index]?.slice(0, 4) : scene.periods[index]?.replace('T', ' ').replace('Z', '')}</output></div>}
      <div className="lola-flow-actions">
        <label><input type="checkbox" checked={animated} onChange={event => setAnimated(event.target.checked)} /> Animate direction</label>
      </div>
      </section>
      <section className="lola-flow-card" role="tabpanel" id="flow-panel-capacity" aria-labelledby="flow-tab-capacity" hidden={tab!=='capacity'}>
        <div className="lola-flow-actions">
          <LolaNearCapacityToggle checked={nearCapacityActive} disabled={nearCapacityDisabled} onChange={setNearCapacity} title={nearCapacityHelp}/>
        </div>
        <label className="lola-limit-setting">Near capacity ≥<input aria-label="Near capacity utilisation (%)" type="number" min="1" max="100" step="1" value={nearPercent} onChange={e=>setNearPercent(Math.min(100,Math.max(1,Math.round(Number(e.target.value)))))} />% of limit
          <button type="button" aria-label="Near capacity threshold help" title="99% is an adjustable display cutoff, allowing a 1% margin below capacity. It is not a model limit. Actual capacity comes from the selected run’s directional limit results. The map and History share this setting and threshold at the loaded time resolution.">?</button></label>
        {annualRatios.length>0&&<p className="lola-flow-note">{annualRatios.filter(value=>value>=nearPercent/100).length} / {annualRatios.length} at ≥{nearPercent}% annual net utilisation. Highest: {(Math.max(...annualRatios)*100).toFixed(1)}%.</p>}
        {scene?<LolaCapacityEvidence projectId={projectId} scene={scene} nearPercent={nearPercent} onEvidence={setCapacityEvidence}/>:<p>Load flows first.</p>}
      </section>
      <div className="lola-flow-play-actions" hidden={tab==='capacity'}><button type="button" className="lola-flow-primary" onClick={() => load()} disabled={busy || !quantity || !granularity}>Load flows</button></div>
      {settingsDiffer&&tab!=='capacity'&&!busy&&status.state!=='error'&&<span className="lola-flow-note">Changes not applied · map shows {flowResolutionLabel(scene.selection.granularity)}.</span>}
      {busy && <div role="status">{status.state === 'catalog' ? 'Reading result catalogues' : topologyStatus.state === 'loading' ? 'Reading connection categories' : `Loading ${status.phase}`} · {status.completed || 0}/{topologyStatus.state === 'loading' ? 1 : status.total || '…'}<progress max={status.total || 1} value={status.completed || 0} /></div>}
      {topologyStatus.state === 'error' && <p role="alert">{topologyStatus.error}</p>}
      {status.state === 'error' && <div role="alert" className="lola-flow-error">
        <strong>{status.requested ? 'Requested flows could not be loaded' : 'Flow catalogue unavailable'}</strong>
        {status.requested && <p>Requested: {flowViewLabel(status.requested)}</p>}
        <p>{status.error}</p>
        <LolaFlowQualityNotice quality={status.quality} />
        {status.code === 'result_observation_conflict' && status.requestKey === requestKey
          && <button type="button" className="lola-flow-primary" disabled={busy} onClick={() => load('exclude_entities')}>Show valid records</button>}
        {scene && <p>The previous flow view remains visible. Still displaying: {flowViewLabel(scene.selection)}.</p>}
      </div>}
      {!busy && catalog && !runs.length && <p>No supported flow result is bound to this model version.</p>}
      {scene && <div className="lola-flow-card" hidden={tab!=='data'}>
        <p className="lola-flow-meta" title={`${flowViewLabel(scene.selection)} · ${modelVersion}`}>{scene.coverage.mapped} mapped · {scene.periods.length} {scene.periods.length === 1 ? 'period' : 'periods'} · {scene.unit}</p>
        <details className="lola-flow-note lola-flow-help"><summary>ⓘ Data coverage</summary>
          {scene.coverage.matched} matched · {scene.coverage.unmapped} without native coordinates · {scene.coverage.unmatched} unmatched.
          {hasLimits && <p>{annual ? 'Annual utilisation = net energy ÷ (directional limit × calendar-year hours). Opposing flows cancel; this is not hourly congestion.' : 'Daily and annual values are summaries, not hourly peaks.'}</p>}
          {scene.derivation && <p>Net energy: {scene.derivation}, matched by exact connection and year.</p>}
          {!hasLimits && <p>No compatible capacity limit for this quantity and time resolution. Observed peaks are not congestion limits.</p>}
          {annual && selectedLine && <p className="lola-flow-note" aria-label="Annual connection metrics">{selectedLine.name} · {flowMetricsLabel(selectedMetrics, true, net) || 'Full-load hours unavailable: no compatible directional limit.'}</p>}
        </details>
        <LolaFlowQualityNotice quality={scene.quality} />
        {scene.coverage.mapped === 0 && <p>No native endpoint coordinates are registered for these connections. Their reported history is available below; no substitute topology is placed on the map.</p>}
        <div className="lola-flow-controls">
          {categories.length>1&&<label>Filter loaded categories<select aria-label="Flow schema category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All loaded categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>}
        </div>
      </div>}
    </div>
  </section>{scene && selectedLine && <LolaFlowHistoryDock context={context} scene={scene} line={selectedLine} nearPercent={nearPercent} onChoosePeriod={showHistoryPeriod}
    nearCapacity={nearCapacityActive} onNearCapacityChange={setNearCapacity} nearCapacityDisabled={nearCapacityDisabled} nearCapacityHelp={nearCapacityHelp}
    connectionSelector={<label className="lola-history-connection">Connection<select aria-label="Selected flow connection" value={selectedLine.id} onChange={event=>onSelect(event.target.value)}>{visibleScene.lines.map(line=><option key={line.id} value={line.id}>{line.name}</option>)}</select></label>}/>}</>;
}
