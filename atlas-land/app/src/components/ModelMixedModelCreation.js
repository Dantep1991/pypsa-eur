import React, { useEffect, useRef, useState } from 'react';
import { atlasApiUrl } from '../config/api';
import './ModelMixedModelCreation.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { textField } from '../agentWorkspace/registry';
import ModelExecutionControls from './ModelExecutionControls';
import { createdModelContext } from '../modelWorkspace/modelExecution';

export async function mixedModelRequest(context, endpoint, body) {
  if (!context?.projectId || !context?.version) throw new Error('Load a saved model version first.');
  const response = await fetch(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(context.projectId)}/mixed-model/${endpoint}`), {
    credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  let result;
  try { result = await response.json(); } catch (_) { throw new Error(`Mixed-model service is unavailable (${response.status}).`); }
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Mixed-model request failed.');
  if (result.schema !== 'nohm.atlas.mixed-model.v1' || result.project_id !== context.projectId || result.source_version !== context.version)
    throw new Error('The response belongs to a different model version.');
  return result;
}

export default function ModelMixedModelCreation({ context, profile, current, request = mixedModelRequest }) {
  const [name, setName] = useState(''), [job, setJob] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const identity = JSON.stringify([context?.projectId, context?.version, profile?.focusCountry, profile?.resolutions,
    profile?.schemeId, [...(profile?.regionIds || [])].sort()]);
  const active = ['preparing', 'creating'].includes(job?.state);
  const storageKey = `atlas-mixed-model:${identity}`;
  useEffect(() => {
    const token = ++generation.current;
    setJob(null); setError(''); setBusy(false);
    const saved = window.localStorage.getItem(storageKey);
    if (saved && context?.projectId) request(context, `jobs/${encodeURIComponent(saved)}`)
      .then(value => { if (generation.current === token) { setJob(value); setName(value.name || ''); } })
      .catch(() => { if (generation.current === token) window.localStorage.removeItem(storageKey); });
    return () => { generation.current += 1; };
    // A staged profile belongs to one exact model and set of resolutions.
  }, [identity, storageKey, request, context?.projectId]);
  useEffect(() => {
    if (!active) return undefined;
    let disposed = false, timer;
    const poll = async () => {
      try {
        const next = await request(context, `jobs/${encodeURIComponent(job.job_id)}`);
        if (!disposed) { setJob(next); setError(''); if (['preparing', 'creating'].includes(next.state)) timer = setTimeout(poll, 1500); }
      } catch (failure) { if (!disposed) { setError(failure.message); timer = setTimeout(poll, 4000); } }
    };
    timer = setTimeout(poll, 600);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, job?.job_id, context?.projectId, request]);
  const submit = async create => {
    const token = generation.current;
    setBusy(true); setError('');
    try {
      const next = await request(context, create ? `jobs/${encodeURIComponent(job.job_id)}/create` : 'preview', create
        ? { confirm: true, source_digest: job.source_digest }
        : { version: context.version, focus: profile.focusCountry, resolutions: profile.resolutions, name,
          ...(profile.resolutions.includes('regional') ? { scheme_id: profile.schemeId, region_ids: profile.regionIds } : {}) });
      if (generation.current === token) { setJob(next); window.localStorage.setItem(storageKey, next.job_id); }
    } catch (failure) { if (generation.current === token) setError(failure.message); }
    finally { if (generation.current === token) setBusy(false); }
  };
  const agent = useWorkspaceAgentRegistry();
  useWorkspaceAgentController('mixed_schema', {
    ready: Boolean(current && context?.projectId), preview: () => submit(false),
    fields: { name: textField('New model name', 120) }, actions: { preview: { description: 'Start previewing the complete aggregated model schema; report actual background progress.' },
      create: { description: 'Review and confirm the completed model schema before publication.', confirmation: true } },
    state: { name, current, loading: busy || active, error, job: job && { state: job.state, phase: job.phase, canCreate: job.can_create, error: job.error } },
  }, async (_action, values) => {
    if (busy || active) return 'Mixed-model preview is running. Progress is shown in Create model.';
    if (values.name != null) { setName(values.name); setJob(null); }
    const next = await agent.wait('mixed_schema', item => item?.ready && (values.name == null || item.state.name === values.name));
    await next.preview();
    const done = await agent.wait('mixed_schema', item => item?.ready && (item.state.job || item.state.error));
    if (done.state.error || done.state.job?.error) throw new Error(done.state.error || done.state.job.error);
    if (done.state.loading) return 'Preparing mixed-model schema. Progress is shown in Create model.';
    return 'Mixed model preview ready. Review before creating.';
  });
  return <section className="model-mixed-creation" aria-label="Create mixed-resolution model">
    <h3>Create mixed-resolution model</h3>
    <p>Keep all technologies and carriers. Aggregate the electricity network using this view.</p>
    <label>Model name<input aria-label="Mixed model name" maxLength={120} value={name} placeholder="Optional"
      disabled={busy || active} onChange={event => { setName(event.target.value); setJob(null); window.localStorage.removeItem(storageKey); }} /></label>
    <button type="button" disabled={!current || !context?.projectId || busy || active}
      onClick={() => submit(false)}>Preview model schema</button>
    {busy && !active && <p role="status">{job ? 'Starting model creation…' : 'Starting schema preview…'}</p>}
    {!current && <small>Apply the mixed view first.</small>}
    {job && <>
      <p role="status">{job.phase}</p>
      {active && job.compiler_progress && <small role="status">{job.compiler_progress.message}
        {job.compiler_progress.completed != null && job.compiler_progress.total != null
          ? ` · ${job.compiler_progress.completed.toLocaleString()}/${job.compiler_progress.total.toLocaleString()}` : ''}</small>}
      {job.counts_after && <dl><div><dt>All model nodes</dt><dd>{job.counts_before.Node} → {job.counts_after.Node} <small>includes attached sector nodes</small></dd></div>
        <div><dt>All model connections</dt><dd>{job.counts_before.Line} → {job.counts_after.Line}</dd></div></dl>}
      {job.state === 'preview_ready' && <button type="button" className="atlas-primary-action"
        disabled={!current || busy || !job.can_create} onClick={() => submit(true)}>Create mixed-resolution model</button>}
      {job.state === 'created' && <a href={job.model_url} target="_top">Open new model</a>}
      {createdModelContext(job, 'mixed') && <ModelExecutionControls context={createdModelContext(job, 'mixed')} workspaceId="mixed_execution" />}
      {job.property_rules?.length > 0 && <details><summary>Aggregation rules · {job.property_rules.length}</summary>
        <ul>{job.property_rules.map((row, index) => <li key={index}>{row.class} · {row.property}: {row.choice.replaceAll('_', ' ')}{row.cached ? ' · cached' : ''}</li>)}</ul></details>}
      {job.warnings?.length > 0 && <details><summary>Modelling assumptions</summary><ul>{job.warnings.map(value => <li key={value}>{value}</li>)}</ul></details>}
      {job.error && <p role="alert">{job.error}</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
