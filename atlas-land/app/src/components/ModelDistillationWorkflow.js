import React, { useEffect, useRef, useState } from 'react';
import { distillationRequest, distillationJobActive, distillationStorageKey, distillationCreationReasons } from '../modelWorkspace/distillationWorkflow';
import './ModelDistillationWorkflow.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { enumField, textField } from '../agentWorkspace/registry';
import ModelExecutionControls from './ModelExecutionControls';
import { createdModelContext } from '../modelWorkspace/modelExecution';

function Selection({ label, options = [], value, onChange, disabled }) {
  return <div className="distill-selection">
    <label>{label}<select aria-label={label} value="" disabled={disabled || !options.length}
      onChange={event => { if (event.target.value) onChange([...value, event.target.value].sort()); }}>
      <option value="">{value.length ? 'Add another…' : 'All — no filter'}</option>
      {options.filter(row => !value.includes(row.id)).map(row => <option key={row.id} value={row.id} disabled={row.enabled === false}>{row.label} ({row.id})</option>)}
    </select></label>
    {value.length > 0 && <div className="distill-chips">{value.map(id => <button type="button" key={id}
      disabled={disabled} aria-label={`Remove ${label} ${id}`} onClick={() => onChange(value.filter(item => item !== id))}>
      {options.find(row => row.id === id)?.label || id} ×</button>)}</div>}
  </div>;
}

export default function ModelDistillationWorkflow({ context, request = distillationRequest, onPreviewMap, onInvalidatePreview, mapPreview }) {
  const [options, setOptions] = useState(null), [countries, setCountries] = useState([]), [carriers, setCarriers] = useState([]);
  const [name, setName] = useState(''), [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [parentRun, setParentRun] = useState(''), [boundaryPolicy, setBoundaryPolicy] = useState('');
  const [gapPolicy, setGapPolicy] = useState('ai_estimate');
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const generation = useRef(0);
  const active = distillationJobActive(job);
  const preserveExchanges = countries.length > 0 && boundaryPolicy === 'parent_exchanges';
  const creationReasons = distillationCreationReasons(job);
  const storageKey = distillationStorageKey(context);
  useEffect(() => {
    const current = ++generation.current;
    setOptions(null); setJob(null); setError(''); setCountries([]); setCarriers([]); setName(''); setParentRun(''); setBoundaryPolicy(''); setBusy(true);
    setGapPolicy('ai_estimate');
    const refresh = async () => {
      try {
        const catalog = await request(context, `options?version=${encodeURIComponent(context.version)}`);
        if (generation.current !== current) return;
        setOptions(catalog);
        const savedId = window.localStorage.getItem(storageKey);
        if (savedId) {
          const saved = await request(context, `jobs/${encodeURIComponent(savedId)}`);
          if (generation.current !== current) return;
          setJob(saved); setCountries(saved.selection.countries); setCarriers(saved.selection.carriers); setName(saved.name);
          setParentRun(saved.parent_run_id || ''); setBoundaryPolicy(saved.boundary_policy || '');
          setGapPolicy(saved.gap_policy || 'ai_estimate');
        }
      } catch (failure) { if (generation.current === current) setError(failure.message); }
      finally { if (generation.current === current) setBusy(false); }
    };
    refresh();
    return () => { generation.current += 1; };
  }, [context.projectId, context.version, storageKey, request, optionsAttempt]);

  useEffect(() => {
    if (!active || !job?.job_id) return undefined;
    let disposed = false, timeout;
    const poll = async () => {
      try {
        const next = await request(context, `jobs/${encodeURIComponent(job.job_id)}`);
        if (disposed) return;
        setJob(next);
        setError(''); // A successful reconnect supersedes a transient polling error.
        if (distillationJobActive(next)) timeout = setTimeout(poll, 1200);
      } catch (failure) {
        if (!disposed) { setError(`${failure.message} The saved job is unchanged; reopen to reconnect.`); timeout = setTimeout(poll, 4000); }
      }
    };
    timeout = setTimeout(poll, 600);
    return () => { disposed = true; clearTimeout(timeout); };
  }, [active, job?.job_id, context.projectId, context.version, request]);

  const change = setter => value => {
    setter(value); setJob(null); setError(''); window.localStorage.removeItem(storageKey);
    onInvalidatePreview?.();
  };
  const submit = async create => {
    const current = generation.current;
    setError(''); setBusy(true);
    try {
      // Use the same selection for the map and persisted model checks. The
      // read-only map can finish first; its own status reports transport errors
      // without cancelling the validation job or authorising publication.
      if (!create && onPreviewMap) {
        Promise.resolve().then(() => {
          if (generation.current === current) return onPreviewMap({ countries: [...countries], carriers: [...carriers], boundaryPolicy });
          return null;
        })
          .catch(() => {});
      }
      const next = create
        ? await request(context, `jobs/${encodeURIComponent(job.job_id)}/create`, { source_digest: job.source_digest, confirm: true })
        : await request(context, 'preview', { version: context.version, countries, carriers, name, parent_run_id: parentRun,
          // Country settings are hidden for carrier-only subsets. Do not
          // submit a stale open-boundary policy after removing every country.
          boundary_policy: countries.length ? boundaryPolicy : '', gap_policy: preserveExchanges ? gapPolicy : 'strict' });
      if (generation.current !== current) return;
      setJob(next); window.localStorage.setItem(storageKey, next.job_id);
    } catch (failure) { if (generation.current === current) setError(failure.message); }
    finally { if (generation.current === current) setBusy(false); }
  };

  const agent = useWorkspaceAgentRegistry();
  useWorkspaceAgentController('create', {
    ready: Boolean(options && !busy), error: !options ? error : '', preview: () => submit(false),
    fields: {
      countries: { ...enumField('Countries', (options?.countries || []).map(row => ({ value: row.id, label: row.label, enabled: row.enabled }))), type: 'list' },
      carriers: { ...enumField('Carriers', (options?.carriers || []).map(row => ({ value: row.id, label: row.label, enabled: row.enabled }))), type: 'list' },
      name: textField('New model name', 120), boundaryPolicy: enumField('Country boundary', ['', 'closed', 'parent_exchanges']),
      parentRun: enumField('Parent solution', [{ value: '', label: 'No parent selected' }, ...(options?.parent_runs || []).map(row => ({ value: row.selection_id, label: row.label || row.run_id, canPreserveExchanges: row.can_preserve_exchanges }))]),
      gapPolicy: enumField('Missing boundary hour policy', ['ai_estimate', 'strict']),
    },
    actions: { configure: { description: 'Select subset countries/carriers, boundary treatment and parent solution.' },
      preview: { description: 'Show the country selection on the map and check the subset and automatic repairs. Does not publish a model.' },
      create: { description: 'Review the preview before creating the separate model.', confirmation: true },
      retry: { description: 'Retry loading model options.' } },
    state: { countries, carriers, name, boundaryPolicy, parentRun, gapPolicy, loading: busy || active, error,
      job: job && { id: job.job_id, state: job.state, phase: job.phase, canCreate: job.can_create,
        completed: job.completed_steps, total: job.total_steps, error: job.error, summary: job.summary } },
  }, async (action, values) => {
    if (action === 'retry') { setOptionsAttempt(value => value + 1); return 'Reloading model options.'; }
    if (active) {
      if (Object.keys(values).length) throw new Error('The subset preview is running. Wait before changing its model settings.');
      return 'Subset preview is running. Progress is shown in Create model.';
    }
    if (Object.keys(values).length) {
      setJob(null); setError(''); window.localStorage.removeItem(storageKey);
      onInvalidatePreview?.();
      for (const [key, setter] of Object.entries({ countries: setCountries, carriers: setCarriers, name: setName,
        boundaryPolicy: setBoundaryPolicy, parentRun: setParentRun, gapPolicy: setGapPolicy })) if (values[key] != null) setter(values[key]);
    }
    const next = await agent.wait('create', item => item?.ready && Object.entries(values).every(([key, value]) => JSON.stringify(item.state[key]) === JSON.stringify(value)));
    if (action === 'preview') {
      if (!next.state.countries.length && !next.state.carriers.length) throw new Error('Select countries or carriers for the subset.');
      if (next.state.countries.length && !next.state.boundaryPolicy) throw new Error('Choose whether to preserve cross-border exchanges or use a closed boundary.');
      if (next.state.boundaryPolicy === 'parent_exchanges' && !next.state.parentRun) throw new Error('Choose the parent solution for cross-border exchanges.');
      await next.preview();
      const finished = await agent.wait('create', item => item?.ready && (item.state.job || item.state.error));
      if (finished.state.error || finished.state.job?.error) throw new Error(finished.state.error || finished.state.job.error);
      if (finished.state.loading) return 'Preparing subset preview. Progress is shown in Create model.';
      return 'Subset preview ready. Review before creating.';
    }
    return 'Subset controls selected.';
  });
  return <div className="distillation-workflow">
    {busy && !options && <p role="status">Loading model options and parent solutions…</p>}
    <div className="distill-selectors">
      <Selection label="Countries" options={options?.countries} value={countries} onChange={change(setCountries)} disabled={busy || active} />
      <Selection label="Carriers" options={options?.carriers} value={carriers} onChange={change(setCarriers)} disabled={busy || active} />
    </div>
    <label>New model name<input value={name} disabled={busy || active} maxLength={120}
      placeholder="Optional — generated from selection" onChange={event => change(setName)(event.target.value)} /></label>
    {countries.length > 0 && <label>Country boundary<select aria-label="Country boundary" value={boundaryPolicy}
      disabled={busy || active} onChange={event => change(setBoundaryPolicy)(event.target.value)}>
      <option value="">Choose before creating the model</option>
      <option value="closed">Closed system — remove cross-border connections</option>
      <option value="parent_exchanges">Preserve cross-border exchanges</option>
    </select></label>}
    <label>Parent solution<select aria-label="Parent solution" value={parentRun}
      disabled={busy || active} onChange={event => change(setParentRun)(event.target.value)}>
      <option value="">{preserveExchanges ? 'Choose the solution whose exchanges to preserve' : 'Choose if a carrier is removed'}</option>
      {(options?.parent_runs || []).map(run => <option key={run.selection_id} value={run.selection_id} title={run.solution_path}
        disabled={preserveExchanges && !run.can_preserve_exchanges}>
        {run.label || run.run_id}</option>)}
    </select></label>
    {preserveExchanges && <label>Missing hours<select aria-label="Missing hours" value={gapPolicy}
      disabled={busy || active} onChange={event => change(setGapPolicy)(event.target.value)}>
      <option value="ai_estimate">AI repair — allow documented estimates</option>
      <option value="strict">Require complete reported results</option>
    </select></label>}
    <button type="button" className="atlas-primary-action" disabled={busy || active || !options || (!countries.length && !carriers.length)}
      onClick={() => submit(false)}>Preview subset</button>
    {mapPreview}
    {job && <section className="distill-job" aria-label="Distillation progress">
      <p role="status">{job.phase}{active ? ` · ${job.completed_steps}/${job.total_steps}` : ''}</p>
      {active && <progress value={job.completed_steps} max={job.total_steps} aria-label="Distillation steps" />}
      {job.summary && <dl>
        <div><dt>Model objects</dt><dd>{job.summary.objects_before.toLocaleString()} → {job.summary.objects_after.toLocaleString()}</dd></div>
        <div><dt>Input records repaired</dt><dd>{job.summary.restored_input_objects.toLocaleString()}</dd></div>
        <div><dt>Dependencies restored</dt><dd>{job.summary.restored_dependencies.toLocaleString()}</dd></div>
        {job.summary.boundary_exchanges_preserved > 0 && <div><dt>Cross-border exchanges preserved</dt>
          <dd>{job.summary.boundary_exchanges_preserved.toLocaleString()} · {job.boundary_repair?.hours?.toLocaleString()} hours</dd></div>}
        {job.summary.estimated_boundary_hours > 0 && <div><dt>AI-estimated hours</dt>
          <dd>{job.summary.estimated_boundary_hours.toLocaleString()} · previous day</dd></div>}
        {job.summary.inactive_boundary_connections > 0 && <div><dt>Verified inactive boundary links</dt>
          <dd>{job.summary.inactive_boundary_connections.toLocaleString()}</dd></div>}
      </dl>}
      {job.warnings?.length > 0 && <details open><summary>Before running this model</summary><ul>{job.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      {job.state === 'preview_ready' && <>
        <button type="button" className="atlas-primary-action" disabled={busy || !job.can_create}
          aria-describedby={creationReasons.length ? 'distill-creation-reasons' : undefined}
          onClick={() => submit(true)}>Create subset model</button>
        {creationReasons.length > 0 && <div id="distill-creation-reasons" role="note" aria-label="Before creating this model">
          {creationReasons.map(reason => <p key={reason}>{reason}</p>)}
        </div>}
      </>}
      {job.state === 'published' && <div className="distill-saved"><strong>{job.name}</strong>
        <span>{job.offspring_project_id} · {job.offspring_version}</span>
        <a href={`/atlas/?nohm-context=1&project=${encodeURIComponent(job.offspring_project_id)}&version=${encodeURIComponent(job.offspring_version)}&mode=model`}>Open created model</a>
      </div>}
      {createdModelContext(job, 'subset') && <ModelExecutionControls context={createdModelContext(job, 'subset')} />}
      {job.error && <div role="alert">
        <p>{job.error}</p>
      </div>}
    </section>}
    {error && <p role="alert">{error}</p>}
    {error && !options && <button type="button" className="atlas-primary-action" disabled={busy}
      onClick={() => setOptionsAttempt(attempt => attempt + 1)}>Retry loading options</button>}
  </div>;
}
