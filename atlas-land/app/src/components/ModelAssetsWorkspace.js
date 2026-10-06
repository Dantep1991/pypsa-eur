import React, { useEffect, useMemo, useState } from 'react';
import { assetPath, readAssetApi, validateAssetBinding, modelAssetFrame } from '../modelWorkspace/modelAssets';
import { modelInputDate } from '../modelWorkspace/modelInputContext';
import { inputPropertyToken, parseInputEquation } from '../modelWorkspace/inputEquation';
import useAssetInputView from '../modelWorkspace/useAssetInputView';
import AssetInputEquation from './AssetInputEquation';
import ModelControlHelp from './ModelControlHelp';
import './ModelAssetsWorkspace.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { inputWorkspace } from '../agentWorkspace/inputs';

export default function ModelAssetsWorkspace({ context, modelVersion, modelMeta, visible = true, selectedId,
  onSelect, onFrame, onShow, onClose }) {
  const projectId = context.projectId;
  const [inventory, setInventory] = useState(null), [scene, setScene] = useState(null);
  const [className, setClassName] = useState(''), [category, setCategory] = useState('');
  const [property, setProperty] = useState('');
  const [equationMode, setEquationMode] = useState(false), [expression, setExpression] = useState('');
  const activeModel = modelMeta?.modelName || '', activeDate = modelInputDate(modelMeta);
  const [inputDate, setInputDate] = useState(activeDate), [inputScenario, setInputScenario] = useState(activeModel ? '@model' : '');
  const [inventoryStatus, setInventoryStatus] = useState('Loading model database…');
  const [classStatus, setClassStatus] = useState(''), [error, setError] = useState('');
  const status = inventoryStatus || classStatus;
  useEffect(() => {
    const controller = new AbortController();
    setInventory(null); setScene(null); setClassName(''); setInventoryStatus('Loading model database…'); setError(''); onFrame(null);
    readAssetApi(assetPath(projectId, '', { version: modelVersion }), { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) {
        validateAssetBinding(payload, projectId, modelVersion); setInventory(payload);
        const first = payload.classes.find(cls => cls.class_name === 'Generator' && cls.total) || payload.classes.find(cls => cls.mapped);
        setClassName(first?.class_name || ''); setInventoryStatus('');
      } }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setInventoryStatus(''); } });
    return () => controller.abort();
  }, [projectId, modelVersion, onFrame]);
  useEffect(() => {
    if (!className) { setClassStatus(''); return undefined; }
    const controller = new AbortController();
    setScene(null); setCategory(''); setProperty(''); setEquationMode(false); setExpression(''); onSelect('');
    setClassStatus('Loading class memberships…'); setError('');
    readAssetApi(assetPath(projectId, '', { version: modelVersion, class_name: className }), { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) {
        validateAssetBinding(payload, projectId, modelVersion); setScene(payload); setClassStatus('');
      } }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setClassStatus(''); } });
    return () => controller.abort();
  }, [projectId, modelVersion, className, onSelect]);
  useEffect(() => { setInputDate(activeDate); setInputScenario(activeModel ? '@model' : ''); },
    [projectId, modelVersion, activeDate, activeModel]);
  const objects = useMemo(() => (scene?.objects || []).filter(obj => !category || obj.category === category), [scene, category]);
  const properties = useMemo(() => [...new Set(objects.flatMap(obj => obj.properties || []))].sort(), [objects]);
  const inputProperty = properties.includes(property) ? property : properties[0] || '';
  const equation = useMemo(() => {
    if (!equationMode) return {};
    try { return { plan: parseInputEquation(expression, properties) }; }
    catch (err) { return { error: err.message }; }
  }, [equationMode, expression, properties]);
  const input = useAssetInputView({ projectId, version: modelVersion, className, category, objects, scene, visible,
    inputMode: true, inputProperty, inputDate, inputScenario, activeModel, equationPlan: equation.plan, equationError: equation.error, onShow });
  const label = equationMode ? expression || 'Equation' : inputProperty;
  const frame = useMemo(() => scene ? modelAssetFrame(objects, input.values, label, selectedId, true) : null,
    [scene, objects, input.values, label, selectedId]);
  useEffect(() => { onFrame(frame); }, [frame, onFrame]);
  const mapped = objects.filter(obj => obj.nodes.some(node => node.position)).length;
  const resolved = objects.filter(obj => Number.isFinite(input.values.get(obj.id)?.value)).length;
  const inputYears = input.context?.available_years || [];
  const yearOptions = [...new Set([...inputYears.map(String), inputDate.slice(0, 4)].filter(Boolean))].sort();
  const warningNotes = [...new Set([...input.values.values()].map(value => value.note).filter(Boolean))];
  const agent = useWorkspaceAgentRegistry();
  useWorkspaceAgentController('inputs', inputWorkspace({ inventory, scene, className, category, property: inputProperty,
    inputDate, inputScenario, input, equationMode, expression, status, error, activeModel }), async (action, values) => {
    if (action === 'cancel') { input.cancel(); return 'Input loading cancelled.'; }
    if (action === 'reload') { input.reload(); return 'Reloading inputs.'; }
    if (values.inputDate && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.inputDate)) throw new Error('Use an input date with year, month, day and time.');
    if (values.className && values.className !== className && ['category', 'property', 'expression'].some(key => values[key] != null))
      throw new Error('Select the input class first, then use its loaded categories and properties.');
    const selectedProperties = [...new Set((scene?.objects || [])
      .filter(row => !(values.category ?? category) || row.category === (values.category ?? category))
      .flatMap(row => row.properties || []))];
    if (values.property != null && !selectedProperties.includes(values.property)) throw new Error('That property is not available in the selected input category.');
    if (values.expression != null) parseInputEquation(values.expression, selectedProperties);
    if (values.className != null) setClassName(values.className);
    if (values.category != null) setCategory(values.category);
    if (values.property != null) { setProperty(values.property); setEquationMode(false); }
    if (values.inputDate != null) setInputDate(values.inputDate);
    if (values.inputYear != null) setInputDate(`${values.inputYear}-01-01T00:00`);
    if (values.inputScenario != null) setInputScenario(values.inputScenario);
    if (values.expression != null) { setExpression(values.expression); setEquationMode(true); }
    const expected = { ...values };
    if (expected.expression != null) delete expected.property;
    const next = await agent.wait('inputs', item => item?.ready && (action === 'configure' || !item.state.loading)
      && Object.entries(expected).every(([key, value]) => item.state[key] === value), 45000);
    if (next.state.error) throw new Error(next.state.error);
    if (action !== 'configure' && next.state.cancelled) throw new Error('Input loading was cancelled. Retry before showing values.');
    return action === 'configure' ? 'Input controls selected.' : `${next.state.resolved} input values shown.`;
  });
  return <section className="model-assets-workspace" aria-label="Model database">
    <header><div><span className="model-assets-eyebrow">MODEL DATABASE</span><h2>Inputs</h2></div><button onClick={onClose} aria-label="Close model database">×</button></header>
    <div className="model-assets-content">
      {(inputDate || activeDate) && <p className="model-assets-context">{(inputDate || activeDate).slice(0, 4)} · {inputScenario !== '@model' ? inputScenario || 'Base inputs' : activeModel || 'Base inputs'} · Current map geography</p>}
      <section className="model-assets-card" aria-label="Data selection">
        <h3>Data selection</h3>
        <div className="model-assets-dates">
          <label>Input date<input type="datetime-local" value={inputDate} onInput={event => setInputDate(event.target.value)} onChange={event => setInputDate(event.target.value)} /></label>
          <label>Scenario<select value={inputScenario} onChange={event => setInputScenario(event.target.value)}>
            {activeModel && <option value="@model">Active model scenarios</option>}
            <option value="">Base inputs</option>{(input.context?.available_scenarios || []).map(name => <option key={name}>{name}</option>)}
          </select></label>
        </div>
        <label>Input year<select value={inputDate.slice(0, 4)} onChange={event => setInputDate(event.target.value ? `${event.target.value}-01-01T00:00` : '')}>
          <option value="">Choose year…</option>{yearOptions.map(value => <option key={value}>{value}</option>)}
        </select></label>
        {!inputDate && <small>Undated constants or a single unambiguous file year.</small>}
        <label>Object class<select value={className} onChange={event => setClassName(event.target.value)}>
          {(inventory?.classes || []).filter(cls => cls.total).map(cls => <option key={cls.class_name} value={cls.class_name}>{cls.class_name} · {cls.mapped}/{cls.total} mapped</option>)}
        </select></label>
        <label>Model category<select value={category} onChange={event => { setCategory(event.target.value); onSelect(''); }}>
          <option value="">All categories</option>{[...new Set((scene?.objects || []).map(obj => obj.category))].map(cat => <option key={cat}>{cat}</option>)}
        </select></label>
        <div className="model-assets-input-view">
          <div className="model-assets-modes" aria-label="Input view">
            <button aria-pressed={!equationMode} onClick={() => setEquationMode(false)}>Property</button>
            <button aria-pressed={equationMode} onClick={() => { setEquationMode(true); if (!expression && inputProperty) setExpression(inputPropertyToken(inputProperty)); }}>Equation</button>
          </div>
          <ModelControlHelp label="input equations">Use [properties], numbers, + − × ÷ and brackets. percent(…) = share of all selected objects, including unmapped ones. Incomplete totals stay unknown. Map view only; model inputs stay unchanged.</ModelControlHelp>
        </div>
        <label>Input property<select value={inputProperty} onChange={event => setProperty(event.target.value)}>
          {!properties.length && <option value="">No input properties</option>}{properties.map(prop => <option key={prop}>{prop}</option>)}
        </select></label>
        {equationMode && <AssetInputEquation property={inputProperty} expression={expression} onChange={setExpression} />}
        {(status || input.busy) && <p role="status">{input.busy && input.progress
          ? `Resolving ${input.progress.property} · ${input.progress.completed}/${input.progress.total} values · ${input.progress.unresolved} unresolved` : status}</p>}
        {input.busy && <button onClick={input.cancel}>Cancel input loading</button>}
        {(error || input.error) && <p role="alert">{error || input.error}</p>}
        {(input.cancelled || (input.error && !equation.error)) && <button onClick={input.reload}>Retry input loading</button>}
        <p className="model-assets-coverage">{mapped.toLocaleString()} / {objects.length.toLocaleString()} objects mapped
          {input.values.size > 0 && ` · ${resolved} with values`}</p>
        {input.values.size > 0 && resolved === 0 && <p role="status">No input values{inputDate ? ` at ${inputDate.slice(0, 4)}` : ''}.
          {inputYears.length ? ` Available input years: ${inputYears.join(', ')}. Choose an input year.` : ` ${warningNotes[0] || 'Choose another property or input date.'}`}</p>}
        {inputYears.filter(year => resolved === 0 && input.values.size > 0 && String(year) !== inputDate.slice(0, 4)).map(year =>
          <button type="button" key={year} onClick={() => setInputDate(`${year}-01-01T00:00`)}>Use {year} inputs</button>)}
        {input.context?.inferred_year && !inputDate && <small>File year {input.context.inferred_year}</small>}
        {frame?.incompatibleUnits && <p role="status">Different units: bubbles use equal sizes.</p>}
        <small>Hover for values. Click to pin; click again to unpin.</small>
      </section>
    </div>
  </section>;
}
