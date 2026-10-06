import React, { useEffect, useRef, useState } from 'react';
import { atlasApiUrl } from '../config/api';
import { fetchModelResultCatalog, fetchModelResultScene } from '../modelWorkspace/resultScene';
import { compareResultScenes, validateComparisonTopology } from '../modelWorkspace/resultComparison';
import { resultMapModes } from '../modelWorkspace/resultPresentation';
import { fetchModelScene } from '../modelWorkspace/modelScene';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import './ModelResultsControls.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { enumField, numberField, textField } from '../agentWorkspace/registry';

export default function ModelComparisonControls({ catalogStatus, context, modelVersion, selection, onScene, onClear, markerScale, onMarkerScaleChange }) {
  const runs = (catalogStatus.catalog?.runs || []).filter(run => run.compatible);
  const [baselineId, setBaselineId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [candidateProject, setCandidateProject] = useState(context?.projectId || '');
  const [candidateVersion, setCandidateVersion] = useState(modelVersion || '');
  const [externalCatalog, setExternalCatalog] = useState(null);
  const [externalLoading, setExternalLoading] = useState(false);
  const [quantityId, setQuantityId] = useState('');
  const [component, setComponent] = useState('');
  const [period, setPeriod] = useState('');
  const [category, setCategory] = useState('');
  const [mode, setMode] = useState('');
  const [preference, setPreference] = useState('auto');
  const [objective, setObjective] = useState('');
  const [status, setStatus] = useState({ phase: '', error: '' });
  const [pair, setPair] = useState(null);
  const [pausedKey, setPausedKey] = useState('');
  const [retry, setRetry] = useState(0);
  const request = useRef(null);
  const compareLatest = useRef(null);
  const lastComparisonKey = useRef('');
  const candidateRuns = externalCatalog ? externalCatalog.runs.filter(run => run.compatible) : runs;
  const baseline = runs.find(run => run.run_id === baselineId) || runs[0];
  const candidate = candidateRuns.find(run => run.run_id === candidateId) || candidateRuns.find(run => run.run_id !== baseline?.run_id) || candidateRuns[0];
  const commonQuantities = (baseline?.quantities || []).filter(q => candidate?.quantities?.some(other => other.id === q.id && other.unit === q.unit));
  const components = [...new Set(commonQuantities.map(q => q.class_name))].sort();
  const actualComponent = components.includes(component) ? component : '';
  const quantities = commonQuantities.filter(q => !actualComponent || q.class_name === actualComponent);
  const quantity = quantities.find(q => q.id === quantityId) || quantities.find(q => q.id === selection?.quantityId) || quantities[0];
  const otherQuantity = candidate?.quantities?.find(q => q.id === quantity?.id);
  const categories = (quantity?.categories || []).filter(cat => otherQuantity?.categories?.includes(cat));
  const actualCategory = categories.includes(category) ? category : '';
  const periods = (quantity?.periods || []).filter(value => (otherQuantity?.periods || []).includes(value));
  const actualPeriod = periods.includes(period) ? period : periods[0];
  const modes = resultMapModes(quantity || {}).filter(item => item.id !== 'mix');
  const actualMode = modes.some(item => item.id === mode) ? mode : modes[0]?.id;
  const candidateProjectId = externalCatalog?.project_id || context?.projectId;
  const sameSolution = Boolean(baseline && candidate && baseline.run_id === candidate.run_id && candidateProjectId === context?.projectId
    && baseline.result_model_version === candidate.result_model_version);
  const catalogMatches = (!catalogStatus.catalog?.project_id || catalogStatus.catalog.project_id === context?.projectId)
    && (!catalogStatus.catalog?.model_version || catalogStatus.catalog.model_version === modelVersion);
  const comparisonKey = catalogStatus.state === 'ready' && catalogMatches && !externalLoading
    && context?.projectId && modelVersion && quantity && actualPeriod && actualMode && !sameSolution
    ? JSON.stringify([context.projectId, modelVersion, baseline.run_id, baseline.result_model_version,
      candidateProjectId, candidate.run_id, candidate.result_model_version, quantity.id, quantity.class_name,
      quantity.property_name, quantity.unit, quantity.report_family, otherQuantity.report_family,
      actualComponent, actualPeriod, actualCategory, actualMode, objective]) : '';
  if (comparisonKey) lastComparisonKey.current = comparisonKey;
  const busy = Boolean(status.phase);
  useEffect(() => { request.current?.abort(); setExternalCatalog(null); setExternalLoading(false); setPair(null); setPausedKey(''); setStatus({ phase: '', error: '' });
    setCandidateProject(context?.projectId || ''); setCandidateVersion(modelVersion || ''); setBaselineId(''); setCandidateId(''); setComponent('');
    return () => request.current?.abort();
  }, [context?.projectId, modelVersion]);
  const start = phase => { request.current?.abort(); const controller = new AbortController(); request.current = controller; setStatus({ phase, error: '' }); return controller; };
  const loadCandidate = async () => {
    setExternalLoading(true);
    setPausedKey(comparisonKey);
    const controller = start('Reading comparison catalogues');
    try {
      const catalog = await fetchModelResultCatalog({ mode: 'model', projectId: candidateProject.trim() }, candidateVersion.trim(), {
        signal: controller.signal, includeAssetCatalog: true,
        onProgress: progress => !controller.signal.aborted && setStatus({ phase: `Reading comparison catalogues · ${progress.completed || 0}/${progress.total || 1}`, error: '' }),
      });
      if (!controller.signal.aborted) { setExternalCatalog(catalog); setCandidateId(''); setPair(null); setExternalLoading(false); setPausedKey(''); setStatus({ phase: '', error: '' }); }
    } catch (error) { if (!controller.signal.aborted) { setExternalLoading(false); setStatus({ phase: '', error: error.message, stage: 'catalog' }); } }
  };
  const apply = (nextPair, choice) => {
    const scene = compareResultScenes(nextPair.baseline, nextPair.candidate, choice === 'auto' ? nextPair.policy.preference : choice);
    onScene({ ...scene, comparison: { ...scene.comparison, policy: nextPair.policy, overridden: choice !== 'auto' } });
  };
  const recommend = async controller => {
    try {
      const response = await fetch(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/comparison-policy`), { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_name: quantity.class_name,
          property_name: quantity.property_name, unit: quantity.unit, category: actualCategory, objective, model_version: modelVersion }) });
      if (!response.ok) throw new Error('Decision service unavailable');
      return await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      return { preference: 'context_dependent', manual_required: true, reason: 'Decision service unavailable. Choose a favourable direction.' };
    }
  };
  const changePreference = async choice => {
    setPreference(choice);
    if (!pair) return;
    if (choice !== 'auto') { apply(pair, choice); return; }
    const controller = start('AI: recommending comparison colours');
    try {
      const policy = await recommend(controller);
      if (controller.signal.aborted) return;
      const next = { ...pair, policy }; setPair(next); apply(next, 'auto'); setStatus({ phase: '', error: '' });
    } catch (error) { if (!controller.signal.aborted) setStatus({ phase: '', error: error.message }); }
  };
  const compare = () => {
    const controller = start('Querying baseline · 0/2');
    const execute = async () => {
    try {
      const candidateContext = { mode: 'model', projectId: externalCatalog?.project_id || context.projectId };
      if (candidateContext.projectId !== context.projectId || candidate.result_model_version !== modelVersion) {
        setStatus({ phase: 'Checking canonical topology identities', error: '' });
        const a = await fetchModelScene({ ...context, version: modelVersion }, { layers: ['grid'], signal: controller.signal });
        if (controller.signal.aborted) return;
        const b = await fetchModelScene({ ...candidateContext, version: candidate.result_model_version }, { layers: ['grid'], signal: controller.signal });
        if (controller.signal.aborted) return;
        validateComparisonTopology(a, b);
      }
      const arm = (run, q) => ({ runId: run.run_id, runLabel: run.label, modelVersion: run.result_model_version,
        runModelVersion: run.result_model_version, className: q.class_name, propertyName: q.property_name,
        reportFamily: q.report_family, unit: q.unit, period: actualPeriod, category: actualCategory,
        categoryObjects: q.category_objects?.[actualCategory] || [], supportsFlowMap: q.supports_flow_map, derivedNetFlow: q.derived_net_flow, mapMode: actualMode });
      setStatus({ phase: 'Querying baseline · 0/2', error: '' });
      const a = await fetchModelResultScene(context, arm(baseline, quantity), { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStatus({ phase: 'Querying candidate · 1/2', error: '' });
      const b = await fetchModelResultScene(candidateContext, arm(candidate, otherQuantity), { signal: controller.signal });
      if (controller.signal.aborted) return;
      let policy = { preference: 'context_dependent', reason: 'Operator-selected interpretation.' };
      if (preference === 'auto') {
        setStatus({ phase: 'AI: interpreting favourable direction · 2/2', error: '' });
        policy = await recommend(controller);
      }
      if (controller.signal.aborted) return;
      const next = { baseline: a, candidate: b, policy }; apply(next, preference); setPair(next); setStatus({ phase: '', error: '' });
    } catch (error) { if (!controller.signal.aborted) setStatus({ phase: '', error: error.message }); }
    };
    execute();
    return controller;
  };
  compareLatest.current = compare;
  useEffect(() => {
    if (!comparisonKey) {
      if (!externalLoading) setStatus({ phase: '', error: '' });
      return undefined;
    }
    if (pausedKey === comparisonKey) return undefined;
    let controller;
    // Coalesce quick dropdown changes. Callback/status/slider rerenders must
    // not launch another comparison for the same selected data and map style.
    const timer = setTimeout(() => { controller = compareLatest.current(); }, 200);
    return () => { clearTimeout(timer); controller?.abort(); };
  }, [comparisonKey, externalLoading, pausedKey, retry]);
  const clear = () => {
    request.current?.abort(); setPausedKey(comparisonKey || lastComparisonKey.current); setPair(null); setStatus({ phase: '', error: '' }); onClear?.();
  };
  const field = (label, value, change, options) => <label className="atlas-results-controls__field"><span>{label}</span><select aria-label={label} value={value || ''} disabled={externalLoading} onChange={event => { request.current?.abort(); change(event.target.value); setPair(null); }}>{options}</select></label>;
  const agent = useWorkspaceAgentRegistry();
  useWorkspaceAgentController('compare', {
    catalog: catalogStatus.catalog,
    loadCandidate,
    ready: catalogStatus.state === 'ready' && !externalLoading && (runs.length >= 2 || !catalogStatus.catalog?.pending_runs?.length),
    fields: {
      baselineId: enumField('Baseline solution', runs.map(row => ({ value: row.run_id, label: row.label }))),
      candidateId: enumField('Candidate solution', candidateRuns.map(row => ({ value: row.run_id, label: row.label }))),
      quantityId: enumField('Comparison component and quantity', commonQuantities.map(row => ({ value: row.id,
        label: `${row.class_name} · ${row.property_name} (${row.unit || ''})`, categories: row.categories, periods: row.periods }))),
      category: enumField('Comparison category', ['', ...new Set(commonQuantities.flatMap(row => row.categories || []))]),
      period: enumField('Comparison period', [...new Set(commonQuantities.flatMap(row => row.periods || []))]),
      mapMode: enumField('Comparison map style', [...new Set(commonQuantities.flatMap(row => resultMapModes(row).filter(item => item.id !== 'mix').map(item => item.id)))]),
      preference: enumField('Favourable change', ['auto', 'increase', 'decrease', 'context_dependent']),
      objective: textField('Comparison objective'),
      candidateProject: textField('Another project ID', 200), candidateVersion: textField('Another model version', 120),
      markerScale: numberField('Circle size multiplier (1 = 100%)', 0.5, 2),
    },
    actions: { show: { description: 'Select two compatible result solutions and compare automatically.' },
      configure: { description: 'Select prerequisite runs or fields before continuing.' },
      load_candidate: { description: 'Load the result catalogue of an explicit other project/version; continue=true before selecting its run.' },
      clear: { description: 'Clear comparison.' }, cancel: { description: 'Cancel comparison.' },
      retry: { description: 'Retry the current comparison.' } },
    state: { baselineId: baseline?.run_id, candidateId: candidate?.run_id, quantityId: quantity?.id,
      category: actualCategory, period: actualPeriod, mapMode: actualMode, preference, objective,
      candidateProject, candidateVersion, markerScale, loading: Boolean(status.phase || externalLoading), error: status.error,
      displayed: pair ? { baseline: pair.baseline.run?.run_id, candidate: pair.candidate.run?.run_id,
        baselineRecords: pair.baseline.values.length, candidateRecords: pair.candidate.values.length } : null },
  }, async (action, values) => {
    if (action === 'clear') { clear(); return 'Comparison cleared.'; }
    if (action === 'cancel') { request.current?.abort(); setPausedKey(comparisonKey); setExternalLoading(false); setStatus({ phase: '', error: '' }); return 'Comparison cancelled.'; }
    const chosen = commonQuantities.find(row => row.id === (values.quantityId || quantity?.id));
    if (values.category && !chosen?.categories.includes(values.category)) throw new Error('That category is not available for this comparison quantity.');
    if (action === 'show' || action === 'retry') {
      if ((values.baselineId || baseline?.run_id) === (values.candidateId || candidate?.run_id)) throw new Error('Choose two different compatible solutions.');
      if (values.period && !chosen?.periods.includes(values.period)) throw new Error('These solutions do not share that comparison period.');
    }
    request.current?.abort(); setPair(null); setPausedKey('');
    if (values.baselineId != null) setBaselineId(values.baselineId);
    if (values.candidateId != null) setCandidateId(values.candidateId);
    if (values.quantityId != null) { setComponent(''); setQuantityId(values.quantityId); }
    if (values.period != null) setPeriod(values.period);
    if (values.category != null) setCategory(values.category);
    if (values.mapMode != null) setMode(values.mapMode);
    if (values.preference != null) setPreference(values.preference);
    if (values.objective != null) setObjective(values.objective);
    if (values.candidateProject != null) setCandidateProject(values.candidateProject);
    if (values.candidateVersion != null) setCandidateVersion(values.candidateVersion);
    if (values.markerScale != null) onMarkerScaleChange(values.markerScale);
    if (action === 'load_candidate') {
      await agent.wait('compare', item => item?.ready && (!values.candidateProject || item.state.candidateProject === values.candidateProject)
        && (!values.candidateVersion || item.state.candidateVersion === values.candidateVersion));
      await agent.controllers.get('compare').loadCandidate();
      return 'Comparison solutions loaded.';
    }
    setRetry(value => value + 1);
    const next = await agent.wait('compare', item => item?.ready && !item.state.loading
      && Object.entries(values).every(([key, value]) => item.state[key] === value)
      && (action === 'configure' || item.state.displayed || item.state.error), 45000);
    if (next.state.error) throw new Error(next.state.error);
    if (action !== 'configure' && !next.state.displayed) throw new Error('Choose two different compatible solutions.');
    return action === 'configure' ? 'Comparison controls selected.' : 'Comparison shown.';
  });
  const runOptions = list => list.map(run => <option key={run.run_id} value={run.run_id}>{run.label} · {run.result_model_version}</option>);
  return <div className="atlas-results-controls" aria-label="Result comparison">
    <p>Candidate − baseline. Missing records are excluded, never treated as zero.</p>
    {(catalogStatus.state === 'loading' || catalogStatus.catalog?.pending_runs?.length > 0) && <p role="status">Reading result catalogues · {catalogStatus.progress?.completed || 0}/{catalogStatus.progress?.total || '…'}</p>}
    {catalogStatus.state === 'error' && <p role="alert">{catalogStatus.error}</p>}
    {catalogStatus.state === 'ready' && !quantity && <p role="status">No common quantities with identical physical units are available in these solutions.</p>}
    {quantity && !actualPeriod && <p role="status">These solutions have no common annual period. Different years are not silently compared.</p>}
    {catalogStatus.state === 'ready' && sameSolution && <p role="status">Choose two different solutions to compare.</p>}
    <div className="atlas-results-controls__fields">
      {field('Baseline solution', baseline?.run_id, setBaselineId, runOptions(runs))}
      {field('Candidate solution', candidate?.run_id, setCandidateId, runOptions(candidateRuns))}
      {field('Comparison component', actualComponent, setComponent, <><option value="">All common components</option>{components.map(value => <option key={value}>{value}</option>)}</>)}
      {field('Comparison quantity', quantity?.id, setQuantityId, quantities.map(q => <option key={q.id} value={q.id}>{q.class_name} · {q.property_name} ({q.unit})</option>))}
      {field('Comparison period', actualPeriod, setPeriod, periods.map(value => <option key={value} value={value}>Annual {value}</option>))}
      {field('Comparison category', actualCategory, setCategory, <><option value="">All categories</option>{categories.map(cat => <option key={cat}>{cat}</option>)}</>)}
      {field('Comparison map style', actualMode, setMode, modes.map(item => <option key={item.id} value={item.id}>{item.label}</option>))}
      {actualMode === 'bubbles' && <ResultMarkerSizeControl value={markerScale} onChange={onMarkerScaleChange} />}
      <label className="atlas-results-controls__field is-wide"><span>Favourable change</span><select aria-label="Favourable change" value={preference} disabled={busy} onChange={event => changePreference(event.target.value)}>
        <option value="auto">AI recommendation</option><option value="increase">Increase is favourable</option><option value="decrease">Decrease is favourable</option><option value="context_dependent">Neutral / context-dependent</option>
      </select></label>
    </div>
    <details><summary>Comparison options</summary>
      <label className="atlas-results-controls__field is-wide"><span>Analysis objective (optional)</span><input aria-label="Comparison objective" value={objective} maxLength={500} disabled={busy} onChange={event => { setObjective(event.target.value); setPair(null); }} placeholder="What does a better outcome mean here?" /></label>
      <details><summary>Another project or model version</summary><div className="atlas-results-controls__fields">
      <label className="atlas-results-controls__field"><span>Project ID</span><input value={candidateProject} onChange={event => setCandidateProject(event.target.value)} disabled={busy} /></label>
      <label className="atlas-results-controls__field"><span>Model version</span><input value={candidateVersion} onChange={event => setCandidateVersion(event.target.value)} disabled={busy} /></label>
    </div><button type="button" onClick={loadCandidate} disabled={busy || !candidateProject.trim() || !candidateVersion.trim()}>Load comparison solutions</button><small>Only matching canonical nodes, coordinates, endpoints, units and periods can be compared.</small></details></details>
    {pair && <div role="status"><p>{preference === 'auto' ? String(pair.policy.reason || '').replace(/\bJev\b/g, 'AI') : preference === 'increase' ? 'Your convention: increases are favourable.' : preference === 'decrease' ? 'Your convention: decreases are favourable.' : 'Neutral comparison.'} {preference === 'auto' && pair.policy.cached ? 'Cached.' : ''}</p><small>Green: favourable · red: unfavourable · blue: flow reversed · grey: unchanged or unclassified.</small><small>{pair.baseline.values.length} baseline records · {pair.candidate.values.length} candidate records. Legend colours are a screening convention, not a claim of overall model improvement.</small></div>}
    {status.error && <p role="alert">{status.error}</p>}
    {busy && <div role="status">{status.phase}<button type="button" onClick={() => { request.current?.abort(); setPausedKey(comparisonKey || lastComparisonKey.current); setExternalLoading(false); setStatus({ phase: '', error: 'Comparison cancelled; previous map retained.' }); }}>Cancel comparison</button></div>}
    <div className="atlas-results-controls__actions">{status.error && status.stage !== 'catalog' && comparisonKey && !busy && <button type="button" className="atlas-primary-action" onClick={() => { setPausedKey(''); setRetry(value => value + 1); }}>Retry comparison</button>}<button type="button" onClick={clear} disabled={externalLoading}>Clear comparison</button></div>
  </div>;
}
