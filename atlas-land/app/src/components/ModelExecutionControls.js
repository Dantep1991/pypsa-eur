import React, { useEffect, useRef, useState } from 'react';
import { enumField } from '../agentWorkspace/registry';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { executionActive, modelExecutionRequest } from '../modelWorkspace/modelExecution';
import './ModelExecutionControls.css';

export default function ModelExecutionControls({ context, workspaceId = 'subset_execution', request = modelExecutionRequest }) {
  const [options, setOptions] = useState(null), [modelName, setModelName] = useState('');
  const [engine, setEngine] = useState('plexos'), [job, setJob] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), [version, setVersion] = useState(context.version);
  const generation = useRef(0), registry = useWorkspaceAgentRegistry();
  const active = executionActive(job), identity = `${context.projectId}:${version}`;
  const bound = { projectId: context.projectId, version };
  useEffect(() => { setVersion(context.version); }, [context.projectId, context.version]);
  useEffect(() => {
    const token = ++generation.current;
    setOptions(null); setJob(null); setError(''); setBusy(true);
    request({ projectId: context.projectId, version }, `options?version=${encodeURIComponent(version)}`)
      .then(value => { if (generation.current === token) {
        setOptions(value); setModelName(value.models.includes(value.jobs?.[0]?.model_name)
          ? value.jobs[0].model_name : value.models.length === 1 ? value.models[0] : '');
        setEngine(previous => value.engines.find(row => row.id === previous && row.available)
          ? previous : value.engines.find(row => row.available)?.id || previous);
        setJob(value.jobs?.[0] || null);
      } })
      .catch(failure => { if (generation.current === token) setError(failure.message); })
      .finally(() => { if (generation.current === token) setBusy(false); });
    return () => { generation.current += 1; };
  }, [context.projectId, version, attempt, request]);
  useEffect(() => {
    if (!active || !job?.job_id) return undefined;
    let disposed = false, timer;
    const poll = async () => {
      try {
        const next = await request({ projectId: context.projectId, version }, `jobs/${encodeURIComponent(job.job_id)}`);
        if (!disposed) { setJob(next); setError(''); if (executionActive(next)) timer = setTimeout(poll, 1500); }
      } catch (failure) { if (!disposed) { setError(failure.message); timer = setTimeout(poll, 4000); } }
    };
    timer = setTimeout(poll, 700);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, job?.job_id, identity, request, context.projectId, version]);
  const submit = async repair => {
    const token = generation.current;
    setBusy(true); setError('');
    try {
      const next = await request(bound, 'start', { version, source_digest: options.source_digest, model_name: modelName, engine, confirm: true, repair });
      if (token === generation.current) setJob(next);
    } catch (failure) { if (token === generation.current) setError(failure.message); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const apply = async () => {
    const token = generation.current;
    setBusy(true); setError('');
    try {
      const next = await request(bound, `jobs/${encodeURIComponent(job.job_id)}/apply`, { source_digest: job.source_digest, confirm: true });
      if (token === generation.current) setJob(next);
    } catch (failure) { if (token === generation.current) setError(failure.message); }
    finally { if (token === generation.current) setBusy(false); }
  };
  useWorkspaceAgentController(workspaceId, {
    ready: Boolean(options && !busy), error: !options ? error : '', inspect: () => submit(true),
    fields: { engine: enumField('Solver', (options?.engines || []).map(row => ({ value: row.id, label: row.label, enabled: row.available }))),
      modelName: enumField('Created model execution target', options?.models || []) },
    actions: { configure: { description: 'Select a solver and exact model target in the newly created model, not its parent.' },
      run: { description: 'Run the created model. Requires user confirmation in this card.', confirmation: true,
        confirmationMessage: 'Choose the model and click Run in the created-model card.' },
      repair: { description: 'Inspect source-grounded repairs without changing the model. Applying repairs requires confirmation.' },
      apply: { description: 'Apply the reviewed repair plan as a new version.', confirmation: true,
        confirmationMessage: 'Review the proposed changes and click Apply repairs in the created-model card.' } },
    state: { projectId: context.projectId, version, engine, modelName, loading: busy || active, error,
      job: job && { id: job.job_id, state: job.state, phase: job.phase, error: job.error, repairedVersion: job.repaired_version } },
  }, async (action, values) => {
    if (busy || active) return 'Model execution is active. Status is shown in Create model.';
    if (values.engine) setEngine(values.engine);
    if (values.modelName) setModelName(values.modelName);
    const next = await registry.wait(workspaceId, entry => entry?.ready && Object.entries(values).every(([key, value]) => entry.state[key] === value));
    if (action === 'repair') {
      if (!next.state.modelName) throw new Error('Choose the model target before inspecting repairs.');
      await next.inspect();
      return 'Repair inspection started. Review the plan before applying.';
    }
    return 'Created-model run controls selected.';
  });
  const canSubmit = Boolean(options && modelName && !busy && !active);
  return <section className="model-execution-controls" aria-label="Run created model">
    <h3>Run model</h3>
    <small>{context.projectId} · {version}</small>
    <div className="model-execution-selectors">
      <label>Solver<select aria-label="Solver" value={engine} disabled={busy || active} onChange={event => setEngine(event.target.value)}>
        {(options?.engines || [{ id: 'plexos', label: 'PLEXOS' }, { id: 'pypsa', label: 'PyPSA' }]).map(row =>
          <option key={row.id} value={row.id} disabled={row.available === false}>{row.label}</option>)}
      </select></label>
      <label>Model<select aria-label="Run model target" value={modelName} disabled={!options || busy || active} onChange={event => setModelName(event.target.value)}>
        <option value="">Choose model</option>{(options?.models || []).map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>
    </div>
    <div className="model-execution-actions">
      <button type="button" className="atlas-primary-action" disabled={!canSubmit || !options?.engines.find(row => row.id === engine)?.available}
        onClick={() => submit(false)}>Run {engine === 'pypsa' ? 'PyPSA' : 'PLEXOS'}</button>
      <button type="button" disabled={!canSubmit} onClick={() => submit(true)}>Repair model</button>
    </div>
    {busy && <p role="status">{options ? 'Starting…' : 'Loading run controls…'}</p>}
    {job && <div className="model-execution-job" aria-live="polite">
      <p role="status">{job.result?.status === 'blocked' ? 'PyPSA · conversion blocked' : job.phase}</p>
      {job.native_run?.workflow?.stages && <ol>{Object.entries(job.native_run.workflow.stages).map(([name, stage]) =>
        <li key={name}>{stage.stage || name}: {stage.status}</li>)}</ol>}
      {job.state === 'repair_ready' && <><ul>{job.repair_actions.map((action, index) =>
        <li key={index}>{action.owner_class} · {action.owner_object}: {action.rationale || action.reason || action.action}</li>)}</ul>
        <button type="button" disabled={busy} onClick={apply}>Apply repairs to a new version</button></>}
      {job.state === 'repaired' && <button type="button" disabled={busy} onClick={() => setVersion(job.repaired_version)}>Use repaired version</button>}
      {job.result?.objective != null && <p>Objective: {job.result.objective.toLocaleString()} · {job.result.snapshots.toLocaleString()} periods</p>}
      {job.error && <p role="alert">{job.result?.status === 'blocked'
        ? 'Conversion needs qualified source mappings. Review Conversion issues.' : job.error}</p>}
      {job.solver_diagnosis?.feasibility_repair_families?.length > 0 && <details><summary>Solver constraints</summary><ul>
        {job.solver_diagnosis.feasibility_repair_families.slice(0, 8).map(row => <li key={row.family}>{row.family}: {row.count} · {row.example}</li>)}</ul></details>}
      {job.result?.conversion?.issues?.length > 0 && <details><summary>Conversion issues</summary><ul>
        {job.result.conversion.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></details>}
    </div>}
    {error && <p role="alert">{error}</p>}
    {error && <button type="button" disabled={busy || active} onClick={() => setAttempt(value => value + 1)}>{options ? 'Refresh run controls' : 'Retry run controls'}</button>}
  </section>;
}
