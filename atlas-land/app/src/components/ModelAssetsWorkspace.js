import React, { useEffect, useMemo, useRef, useState } from 'react';
import { assetPath, readAssetApi, validateAssetBinding, inputAssetValues, assetOutputSeries,
  modelAssetFrame, fetchAssetOutputsCatalog, validateAssetWindow } from '../modelWorkspace/modelAssets';
import { FLOW_RESOLUTIONS, flowResolutionLabel } from '../modelWorkspace/lolaFlowData';
import './ModelAssetsWorkspace.css';

const emptyValues = new Map();
const number = value => value?.toLocaleString(undefined, { maximumFractionDigits: 3 });

export default function ModelAssetsWorkspace({ context, modelVersion, selectedId, onSelect, onFrame, onClose }) {
  const projectId = context.projectId;
  const [inventory, setInventory] = useState(null), [scene, setScene] = useState(null);
  const [className, setClassName] = useState(''), [category, setCategory] = useState('');
  const [mode, setMode] = useState('objects'), [property, setProperty] = useState('');
  const [inputDate, setInputDate] = useState(''), [inputScenario, setInputScenario] = useState('');
  const [inputContext, setInputContext] = useState(null);
  const [values, setValues] = useState(emptyValues), [outputs, setOutputs] = useState(null), [period, setPeriod] = useState('');
  const [runs, setRuns] = useState([]), [choice, setChoice] = useState({});
  const [inventoryStatus, setInventoryStatus] = useState('Loading model database…');
  const [classStatus, setClassStatus] = useState(''), [catalogStatus, setCatalogStatus] = useState('');
  const [error, setError] = useState('');
  const status = inventoryStatus || classStatus || catalogStatus;
  const [queryBusy, setQueryBusy] = useState(false);
  const [inputProgress, setInputProgress] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [detail, setDetail] = useState(null), [detailError, setDetailError] = useState('');
  const queryRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setInventory(null); setScene(null); setClassName(''); setInventoryStatus('Loading model database…'); setSettingsOpen(true); onFrame(null);
    readAssetApi(assetPath(projectId, '', { version: modelVersion }), { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) {
        validateAssetBinding(payload, projectId, modelVersion); setInventory(payload);
        const first = payload.classes.find(cls => cls.class_name === 'Generator' && cls.total) || payload.classes.find(cls => cls.mapped);
        setClassName(first?.class_name || ''); setInventoryStatus('');
      } }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setInventoryStatus(''); } });
    return () => { controller.abort(); queryRef.current?.abort(); };
  }, [projectId, modelVersion, onFrame]);
  useEffect(() => {
    if (!className) { setClassStatus(''); return undefined; }
    const controller = new AbortController();
    queryRef.current?.abort(); setScene(null); setValues(emptyValues); setOutputs(null); setCategory(''); setProperty(''); onSelect('');
    setClassStatus('Loading class memberships…'); setError('');
    readAssetApi(assetPath(projectId, '', { version: modelVersion, class_name: className }), { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) {
        validateAssetBinding(payload, projectId, modelVersion); setScene(payload); setClassStatus('');
      } }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setClassStatus(''); } });
    return () => controller.abort();
  }, [projectId, modelVersion, className, onSelect]);
  useEffect(() => {
    if (mode !== 'outputs' || !className) { setCatalogStatus(''); return undefined; }
    const controller = new AbortController(); setRuns([]); setChoice({}); setCatalogStatus('Reading available outputs…'); setError('');
    fetchAssetOutputsCatalog(projectId, modelVersion, className, controller.signal,
      message => { if (!controller.signal.aborted) setCatalogStatus(message); })
      .then(result => { if (!controller.signal.aborted) { setRuns(result); setCatalogStatus(''); } })
      .catch(err => { if (!controller.signal.aborted) { setError(err.message); setCatalogStatus(''); } });
    return () => controller.abort();
  }, [projectId, modelVersion, className, mode]);
  const objects = useMemo(() => (scene?.objects || []).filter(obj => !category || obj.category === category), [scene, category]);
  const selected = objects.find(obj => obj.id === selectedId);
  const properties = [...new Set(objects.flatMap(obj => obj.properties))].sort();
  const inputProperty = properties.includes(property) ? property : properties[0] || '';
  const run = runs.find(item => item.run_id === choice.runId) || runs[0];
  const quantity = run?.quantities.find(item => item.id === choice.quantityId) || run?.quantities[0];
  const resolutions = FLOW_RESOLUTIONS.filter(value => quantity?.available_granularities.includes(value));
  const granularity = resolutions.includes(choice.granularity) ? choice.granularity : resolutions[0];
  const year = run?.periods?.[0] || '';
  const dateFrom = choice.dateFrom || `${year}-01-01`, dateTo = choice.dateTo || `${year}-01-01`;
  const liveValues = mode === 'outputs' ? outputs?.series.get(period) || emptyValues : mode === 'inputs' ? values : emptyValues;
  const label = mode === 'outputs' && outputs ? outputs.label : mode === 'inputs' && values.size ? values.label : 'Model objects';
  useEffect(() => {
    onFrame(scene ? modelAssetFrame(objects, liveValues, label, selectedId, Boolean(outputs) || values.size > 0) : null);
  }, [scene, objects, liveValues, label, selectedId, outputs, values.size, onFrame]);
  // Any selection change invalidates a pending query and its previous measurements.
  const selectionKey = JSON.stringify([className, category, mode, inputProperty, choice, inputDate, inputScenario]);
  useEffect(() => { queryRef.current?.abort(); setQueryBusy(false); setInputProgress(null); setValues(emptyValues); setOutputs(null); setError(''); }, [selectionKey]);
  useEffect(() => { setInputContext(null); setInputDate(''); setInputScenario(''); }, [projectId, modelVersion, className, category, inputProperty]);
  useEffect(() => {
    setDetail(null); setDetailError('');
    if (!selected) return undefined;
    const controller = new AbortController();
    readAssetApi(assetPath(projectId, '/detail', { version: modelVersion, class_name: selected.class_name,
      category: selected.category, name: selected.name }), { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) setDetail(validateAssetBinding(payload, projectId, modelVersion)); })
      .catch(err => { if (!controller.signal.aborted) setDetailError(err.message); });
    return () => controller.abort();
  }, [projectId, modelVersion, selected]);
  const load = async () => {
    queryRef.current?.abort(); const controller = new AbortController(); queryRef.current = controller;
    setQueryBusy(true); setError('');
    try {
      if (mode === 'inputs') {
        const next = new Map(); next.label = inputProperty;
        const years = new Set(), scenarios = new Set(), inferredYears = new Set();
        let latestContext = null;
        setInputProgress({ completed: 0, total: objects.length, unresolved: 0 });
        for (let offset = 0; offset < objects.length; offset += 50) {
          const ids = objects.slice(offset, offset + 50).map(obj => obj.id);
          const payload = validateAssetBinding(await readAssetApi(assetPath(projectId, '/inputs', {
            version: modelVersion, class_name: className, property_name: inputProperty,
            category, input_date: inputDate, scenario: inputScenario, object_ids: JSON.stringify(ids) }),
            { signal: controller.signal }), projectId, modelVersion);
          if (controller.signal.aborted) return;
          if (payload.resolution_contract && (payload.objects.length !== ids.length ||
              payload.objects.some(obj => !ids.includes(obj.id)) || new Set(payload.objects.map(obj => obj.id)).size !== ids.length))
            throw new Error('Input response does not match the requested schema objects.');
          inputAssetValues(payload).forEach((value, id) => next.set(id, value));
          latestContext = payload.input_context || null;
          (latestContext?.available_years || []).forEach(value => years.add(value));
          (latestContext?.available_scenarios || []).forEach(value => scenarios.add(value));
          if (latestContext?.inferred_year) inferredYears.add(latestContext.inferred_year);
          setInputProgress({ completed: Math.min(objects.length, offset + ids.length), total: objects.length,
            unresolved: [...next.values()].filter(value => value.value == null).length });
        }
        if (!controller.signal.aborted) {
          setInputContext(latestContext ? { ...latestContext, available_years: [...years].sort(),
            available_scenarios: [...scenarios].sort(), inferred_year: inferredYears.size === 1 ? [...inferredYears][0] : null } : null); setValues(next);
          setSettingsOpen(![...next.values()].some(value => value.value != null));
        }
      } else {
        validateAssetWindow(dateFrom, dateTo, granularity);
        const names = objects.map(obj => obj.name);
        if (!names.length) throw new Error('Choose a category containing model objects.');
        const payload = await readAssetApi(`/api/solutions/${encodeURIComponent(projectId)}/query`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ run_ids: [run.run_id], class_name: quantity.class_name, property_name: quantity.property_name,
            report_family: quantity.report_family, granularity, group_by: 'object', entity_names: names,
            date_from: dateFrom, date_to: `${dateTo}T23:59:59`, aggregation_method: 'auto', quantity_aware_aggregation: true, limit: 150000 }) });
        const next = assetOutputSeries(payload, scene.objects, context, { runId: run.run_id, modelVersion,
          className: quantity.class_name, propertyName: quantity.property_name,
          reportFamily: quantity.report_family, unit: quantity.units_by_granularity?.[granularity] || quantity.unit,
          dateFrom, dateTo, granularity });
        if (!controller.signal.aborted) { setOutputs({ ...next, label: `${quantity.property_name} · ${run.label}` }); setPeriod(next.periods[0]); setSettingsOpen(false); }
      }
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { if (!controller.signal.aborted) setQueryBusy(false); }
  };
  const mapped = objects.filter(obj => obj.nodes.some(node => node.position)).length;
  const missing = objects.filter(obj => obj.nodes.length && !obj.nodes.some(node => node.position)).length;
  const colocated = selected ? objects.filter(obj => obj.nodes.some(node => selected.nodes.some(other => other.id === node.id))) : [];
  const updateChoice = patch => setChoice(previous => ({ ...previous, ...patch }));
  return <section className="model-assets-workspace" aria-label="Model database">
    <header><div><span className="model-assets-eyebrow">MODEL DATABASE</span><h2>Inputs & outputs</h2></div><button onClick={onClose} aria-label="Close model database">×</button></header>
    <div className="model-assets-content">
      <section className="model-assets-card">
        <button className="model-assets-settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}>Data selection <span>{settingsOpen ? '−' : '+'}</span></button>
        {!settingsOpen && <p>{className} · {category || 'All categories'} · {mode}</p>}
        {settingsOpen && <>
        <label>Object class<select value={className} onChange={event => setClassName(event.target.value)}>
          {(inventory?.classes || []).filter(cls => cls.total).map(cls => <option key={cls.class_name} value={cls.class_name}>{cls.class_name} · {cls.mapped}/{cls.total} mapped</option>)}
        </select></label>
        <label>Model category<select value={category} onChange={event => { setCategory(event.target.value); onSelect(''); }}>
          <option value="">All categories</option>{[...new Set((scene?.objects || []).map(obj => obj.category))].map(cat => <option key={cat}>{cat}</option>)}
        </select></label>
        <div className="model-assets-modes" aria-label="Database view">{['objects', 'inputs', 'outputs'].map(value => <button key={value} aria-pressed={mode === value}
          onClick={() => setMode(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
        {mode === 'inputs' && <>
          <label>Input property<select value={inputProperty} onChange={event => setProperty(event.target.value)}>{properties.map(prop => <option key={prop}>{prop}</option>)}</select></label>
          <div className="model-assets-dates">
            <label>Input date<input type="datetime-local" value={inputDate} onInput={event => setInputDate(event.target.value)} onChange={event => setInputDate(event.target.value)} /></label>
            <label>Scenario<select value={inputScenario} onChange={event => setInputScenario(event.target.value)}>
              <option value="">Base inputs</option>{(inputContext?.available_scenarios || []).map(name => <option key={name}>{name}</option>)}
            </select></label>
          </div>
          {!inputDate && <small>Undated constants or a single unambiguous file year.</small>}
          {(inputContext?.available_years || []).length > 1 && <label>Linked file year<select value={inputDate.slice(0, 4)} onChange={event => setInputDate(`${event.target.value}-01-01T00:00`)}>
            <option value="">Choose year…</option>{inputContext.available_years.map(value => <option key={value}>{value}</option>)}
          </select></label>}
        </>}
        {mode === 'outputs' && <>
          <label>Result run<select value={run?.run_id || ''} onChange={event => setChoice({ runId: event.target.value })}>{runs.map(item => <option key={item.run_id} value={item.run_id}>{item.label}</option>)}</select></label>
          <label>Output quantity<select value={quantity?.id || ''} onChange={event => updateChoice({ quantityId: event.target.value })}>{(run?.quantities || []).map(q => <option key={q.id} value={q.id}>{q.property_name} · {q.units_by_granularity?.[granularity] || q.unit || 'unit not declared'} · {q.report_family}</option>)}</select></label>
          <label>Time resolution<select value={granularity || ''} onChange={event => updateChoice({ granularity: event.target.value })}>{resolutions.map(value => <option key={value} value={value}>{flowResolutionLabel(value)}</option>)}</select></label>
          <div className="model-assets-dates"><label>From<input type="date" value={dateFrom} onChange={event => updateChoice({ dateFrom: event.target.value })} /></label><label>To<input type="date" value={dateTo} onChange={event => updateChoice({ dateTo: event.target.value })} /></label></div>
          {!status && !runs.length && <p>No reported outputs for this class in a bound result run.</p>}
        </>}
        {mode !== 'objects' && <button className="model-assets-primary" onClick={load} disabled={queryBusy || Boolean(status) || !scene || (mode === 'outputs' ? !quantity : !inputProperty)}>Show {mode} on map</button>}
        </>}
        {(status || queryBusy) && <p role="status">{queryBusy && mode === 'inputs' && inputProgress
          ? `Resolving inputs · ${inputProgress.completed}/${inputProgress.total} objects · ${inputProgress.unresolved} unresolved`
          : queryBusy ? `Reading ${mode} · ${objects.length} ${className} objects…` : status}</p>}
        {queryBusy && mode === 'inputs' && <button onClick={() => { queryRef.current?.abort(); setQueryBusy(false); setInputProgress(null); }}>Cancel input loading</button>}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="model-assets-card" aria-label="Mapped database coverage"><strong>{mapped.toLocaleString()} / {objects.length.toLocaleString()} objects mapped</strong>
        <p>{label}{mode === 'outputs' && outputs ? ` · ${outputs.unit}` : ''}</p>
        {(liveValues.size > 0 || outputs) && <p>{objects.filter(obj => liveValues.get(obj.id)?.value != null).length} objects with {mode === 'outputs' ? 'reported values at this period' : 'resolved input values'}. Unresolved values are not zero.</p>}
        {mode === 'inputs' && inputContext && liveValues.size > 0 && <>
          <p>{inputContext.input_date || (inputContext.inferred_year ? `File year ${inputContext.inferred_year}` : 'Undated inputs')} · {inputContext.scenario || 'Base inputs'}
            {' · '}{objects.filter(obj => liveValues.get(obj.id)?.provenance?.kind === 'datafile').length} linked-file values</p>
          {[...new Set(objects.map(obj => liveValues.get(obj.id)?.note).filter(Boolean))].slice(0, 3).map(note => <small key={note}>{note}</small>)}
        </>}
        {outputs?.unmatched > 0 && <p>{outputs.unmatched} result rows do not match an object in this schema.</p>}
        <p>{missing.toLocaleString()} without node coordinates · {(objects.length - mapped - missing).toLocaleString()} without a spatial membership</p>
        {outputs && <label>Displayed period<select value={period} onChange={event => setPeriod(event.target.value)}>{outputs.periods.map(stamp => <option key={stamp}>{stamp}</option>)}</select></label>}
        <details><summary>How positions and values are mapped</summary><p>Only exact model memberships and registered node coordinates are used. Multi-node assets appear at each connected node; their values are not added together. Bubble size uses the largest absolute asset value at a location. Input properties retain their declared units and are not multiplied by Units. Linked files use exact object and date matches. Expressions, patterns and ambiguous conditions remain unresolved; this is a read-only snapshot, not a solver evaluation.</p></details>
        <label>Inspect object<select value={selected?.id || ''} onChange={event => onSelect(event.target.value)}><option value="">Select on map or choose an object…</option>{objects.map(obj => <option key={obj.id} value={obj.id}>{obj.name}{obj.nodes.some(node => node.position) ? '' : ' · unmapped'}</option>)}</select></label>
      </section>
      {selected && <section className="model-assets-card" aria-label="Model object inspector"><h3>{selected.name}</h3><p>{selected.class_name} · {selected.category}</p>
        {colocated.length > 1 && <label>Other objects at these nodes<select value={selected.id} onChange={event => onSelect(event.target.value)}>{colocated.map(obj => <option key={obj.id} value={obj.id}>{obj.name}</option>)}</select></label>}
        <strong>{liveValues.get(selected.id)?.value != null ? `${number(liveValues.get(selected.id).value)} ${liveValues.get(selected.id).unit}` : liveValues.get(selected.id)?.note || (outputs ? 'Not reported at this period' : 'Select an input or output quantity')}</strong>
        {liveValues.get(selected.id)?.provenance?.kind === 'datafile' && <details><summary>Linked input source</summary>
          <dl>{Object.entries(liveValues.get(selected.id).provenance).filter(([key]) => ['reference', 'filename', 'object', 'row', 'column', 'calendar'].includes(key)).map(([key, value]) =>
            <React.Fragment key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></React.Fragment>)}</dl>
        </details>}
        <ul>{selected.nodes.map(node => <li key={node.id}>{node.class_name}: {node.name}{node.position ? '' : ' · coordinates unavailable'}
          <small>{node.path.map(step => step.collection).join(' → ')}{node.position && ` · ${node.position.source}`}</small></li>)}</ul>
        {detailError && <p role="alert">{detailError}</p>}
        {detail ? <><details><summary>All input records</summary>{Object.entries(detail.collections).map(([collection, data]) => <div key={collection}>
          {Object.entries(data.properties || {}).map(([name, rows]) => <details key={name}><summary>{name}</summary>{(Array.isArray(rows) ? rows : [rows]).map((row, index) => <dl key={index}>{Object.entries(row).filter(([,value]) => value !== '' && value != null).map(([key, value]) => <React.Fragment key={key}><dt>{key.replaceAll('_x0020_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></React.Fragment>)}</dl>)}</details>)}
        </div>)}</details><small>{detail.source}</small></> : !detailError && <p>Loading model records…</p>}
      </section>}
    </div>
  </section>;
}
