import { useEffect, useRef } from 'react';
import { atlasApiUrl } from '../config/api';
import { adaptModelResultScene, projectModelResultScene, resultQueryPointers } from '../modelWorkspace/resultScene';
import { attachPipelinePositions, attachAssetPositions, fetchResultAssets } from '../modelWorkspace/resultAssetProjection';
import { comparisonAnalysisScene } from '../modelWorkspace/comparisonAnalysisScene';
import { selectedResultCategories } from '../modelWorkspace/resultCategories';

export const ANALYSIS_VIEW_MESSAGE = 'nohm.atlas.analysis-view.v1';
export const ANALYSIS_RESULT_MESSAGE = 'nohm.atlas.analysis-result.v1';
export const ANALYSIS_DISPLAY_MESSAGE = 'nohm.atlas.analysis-display.v1';

export function selectedAnalysisSource(selection, version) {
  if (!selection?.runId || selection.runModelVersion !== version || !selection.className || !selection.propertyName
      || !/^\d{4}$/.test(selection.period || '')) return null;
  return { analysis_query: resultQueryPointers(selection), selection };
}

export function analysisViewFor(context, version, result, flow, level, viewId) {
  const query = flow?.analysis_query || result?.analysis_query;
  const selection = flow?.analysis_selection || result?.selection;
  if (context?.mode !== 'model' || !query || query.run_ids?.length !== 1) return null;
  let start = query.date_from || '', end = query.date_to || '';
  // Flow playback publishes the displayed period, not every period in its history.
  if (flow?.period && ['hour', 'day', 'week', 'month', 'year'].includes(query.granularity)) {
    const date = new Date(flow.period);
    if (!Number.isFinite(date.getTime())) return null;
    start = date.toISOString();
    const next = new Date(date);
    if (query.granularity === 'hour') next.setUTCHours(next.getUTCHours() + 1);
    else if (query.granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (query.granularity === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
    else next.setUTCDate(next.getUTCDate() + (query.granularity === 'week' ? 7 : 1));
    end = new Date(next.getTime() - 1000).toISOString();
  }
  const view = { view_id: viewId, project_id: context.projectId, model_version: version,
    model_name: context.modelName || '', run_id: query.run_ids[0], class_name: query.class_name,
    property_name: query.property_name, report_family: query.report_family || '', granularity: query.granularity,
    date_from: start, date_to: end, category: selection?.category || '',
    categories: selectedResultCategories(selection),
    entity_names: query.entity_names || [], nodes: query.nodes || [], countries: query.countries || [],
    map_level: level || 'native' };
  if (result?.analysis_artifact) {
    view.analysis_id = result.analysis_artifact;
    view.mapped_entity_ids = result.values.map(row => row.entity_id);
    view.analysis_period = result.selection?.period || '';
    view.displayed_property = result.selection?.property_name || '';
    view.derivation = result.derivation || '';
  }
  if (!flow && result?.comparison) {
    const comparison = result.comparison;
    const source = role => {
      const pointer = comparison[`${role}_query`];
      if (pointer?.run_ids?.length !== 1 || pointer.run_ids[0] !== comparison[role]?.run_id
        || !comparison[`${role}_project`] || !comparison[`${role}_version`]) return null;
      return { project_id: comparison[`${role}_project`], model_version: comparison[`${role}_version`],
        run_id: pointer.run_ids[0], class_name: pointer.class_name, property_name: pointer.property_name,
        report_family: pointer.report_family || '', granularity: pointer.granularity,
        date_from: pointer.date_from || '', date_to: pointer.date_to || '',
        entity_names: pointer.entity_names || [], nodes: pointer.nodes || [], countries: pointer.countries || [] };
    };
    const baseline = source('baseline'), candidate = source('candidate');
    // Never publish only the candidate when the painted layer is a comparison.
    if (!baseline || !candidate) return null;
    view.comparison = { baseline, candidate, delta: 'candidate_minus_baseline',
      preference: comparison.preference, map_mode: selection?.map_mode || '',
      displayed_property: selection?.property_name || '', derivation: comparison.derivation || '',
      unit: result.legend?.unit || '' };
  }
  return view;
}

export function derivedAnalysisScene(document, period) {
  if (document.comparison) return comparisonAnalysisScene(document, period);
  const rows = document.rows.filter(row => !period || row.period === period);
  const periods = [...new Set(rows.map(row => row.period))];
  if (periods.length > 1) throw new Error('Choose a single displayed period before mapping derived data.');
  const numbers = rows.map(row => row.value);
  if (!numbers.length) throw new Error('No calculated records exist for this displayed period.');
  if (numbers.some(value => !Number.isFinite(value))) throw new Error('Invalid calculated map values.');
  const cls = document.class_name;
  return adaptModelResultScene({ schema: 'nohm.atlas.result-scene.v2', project_id: document.view.project_id,
    model_version: document.view.model_version, run: { run_id: document.view.run_id, label: document.name },
    analysis_query: document.queries[Object.keys(document.queries)[0]].query,
    derived_analysis: { analysis_id: document.analysis_id, expression: document.expression },
    selection: { id: `${cls}.${document.name}`, class_name: cls, property_name: document.name,
      period: periods[0], period_label: `${document.name} · ${periods[0] || ''}`,
      map_target: ['Line', 'Gas Pipeline'].includes(cls) ? 'link' : 'node',
      map_mode: ['Line', 'Gas Pipeline'].includes(cls) ? 'colour' : 'bubbles', direction_supported: false,
      category: document.category, categories: document.categories || document.view.categories },
    values: rows, legend: { unit: document.unit, minimum: numbers.reduce((min, value) => Math.min(min, value), Infinity),
      maximum: numbers.reduce((max, value) => Math.max(max, value), -Infinity),
      maximum_magnitude: numbers.reduce((max, value) => Math.max(max, Math.abs(value)), 0), scale: 'sequential' },
    coverage: { source_row_count: rows.length, projected_row_count: rows.length,
      analysis_excluded_count: document.excluded.length },
  });
}

export default function useAtlasAnalysisBridge({ context, version, status, flow, level, sourceSelection, facilities, connections,
  setResult, clearFlow }) {
  const viewRef = useRef(null), abortRef = useRef(null), generationRef = useRef(0);
  const identityRef = useRef('');
  useEffect(() => {
    if (status.state === 'loading' && status.analysisProjection) return;
    const result = status.state === 'ready' ? status.scene : null;
    // A derived replacement preserves the original view id so repeated calculations
    // and the Save/Show actions remain bound to their source, not a synthetic output.
    if (result?.derived_analysis && result.project_id === context?.projectId && result.model_version === version) {
      if (viewRef.current?.map_level === (level || 'native')) {
        if (viewRef.current.analysis_id !== result.derived_analysis.analysis_id || viewRef.current.analysis_period !== result.selection.period) {
          const view = { ...viewRef.current, analysis_id: result.derived_analysis.analysis_id,
            mapped_entity_ids: result.values.map(row => row.entity_id),
            analysis_period: result.selection.period, displayed_property: result.selection.property_name, derivation: result.derived_analysis.expression };
          viewRef.current = view;
          identityRef.current = `derived:${view.analysis_id}`;
          if (window.parent !== window) window.parent.postMessage({ type: ANALYSIS_VIEW_MESSAGE, view }, window.location.origin);
        }
        return;
      }
      // Derived ratios have no implicit regional sum/weighting. Do not retain a
      // native analysis pointer after the map geography changes.
      abortRef.current?.abort(); generationRef.current += 1; viewRef.current = null; identityRef.current = '';
      setResult({ state: 'idle', scene: null, error: 'Reload source results at native geography before calculating derived data.' });
      if (window.parent !== window) window.parent.postMessage({ type: ANALYSIS_VIEW_MESSAGE, view: null }, window.location.origin);
      return;
    }
    // Selecting a registered solution is sufficient to read its reported data.
    // No painted values or substitute run enter this pointer.
    const source = result || selectedAnalysisSource(sourceSelection, version);
    const query = analysisViewFor(context, version, source, flow, level, 'pending');
    const identity = JSON.stringify(query);
    if (identity === identityRef.current) return;
    identityRef.current = identity;
    abortRef.current?.abort(); generationRef.current += 1;
    const view = query ? { ...query, view_id: `atlas-${Date.now()}-${generationRef.current}` } : null;
    viewRef.current = view;
    if (window.parent !== window) window.parent.postMessage({ type: ANALYSIS_VIEW_MESSAGE, view }, window.location.origin);
  }, [context, version, status, flow, level, sourceSelection, setResult]);
  useEffect(() => {
    const receive = async event => {
      const packet = event.data, view = viewRef.current;
      const sameArtifact = packet?.analysisId && packet.analysisId === view?.analysis_id;
      if (event.source !== window.parent || event.origin !== window.location.origin
        || packet?.type !== ANALYSIS_RESULT_MESSAGE || !view || (!sameArtifact && packet.viewId !== view.view_id)
        || packet.projectId !== view.project_id || packet.modelVersion !== view.model_version
        || (!sameArtifact && packet.runId !== view.run_id) || !/^[a-f0-9]{32}$/.test(packet.analysisId || '')
        || (packet.period != null && (typeof packet.period !== 'string' || packet.period.length > 256))) return;
      const report = (state, details = {}) => window.parent.postMessage({ type: ANALYSIS_DISPLAY_MESSAGE,
        analysisId: packet.analysisId, projectId: packet.projectId, modelVersion: packet.modelVersion,
        state, ...details }, window.location.origin);
      abortRef.current?.abort();
      const controller = new AbortController(); abortRef.current = controller;
      const generation = generationRef.current;
      setResult(previous => ({ ...previous, state: 'loading', analysisProjection: true, progress: { phase: 'derived map projection' }, error: '' }));
      try {
        const response = await fetch(atlasApiUrl(`/api/atlas/projects/${encodeURIComponent(view.project_id)}/analysis/${packet.analysisId}`), { signal: controller.signal });
        const document = await response.json();
        if (!response.ok) throw new Error(document.detail || 'Calculated data unavailable.');
        if (document.view.view_id !== packet.viewId || document.view.run_id !== packet.runId
          || document.view.model_version !== version || document.view.project_id !== context.projectId) throw new Error('Calculated data is from a different map view.');
        if (view.comparison && !document.comparison) throw new Error('A single-run metric cannot replace a two-source comparison.');
        let scene = derivedAnalysisScene(document, packet.period);
        const selection = { className: document.class_name, modelVersion: version };
        const options = { signal: controller.signal };
        if (scene.selection.map_target === 'link') scene = await attachPipelinePositions(scene, context, selection, options, window.fetch.bind(window));
        else scene = attachAssetPositions(scene, await fetchResultAssets(context, version, document.class_name, options, window.fetch.bind(window)));
        if (controller.signal.aborted || generation !== generationRef.current) return;
        scene = projectModelResultScene(scene, facilities, connections);
        if (!scene.values.length) throw new Error('Calculated data has no canonical coordinates in this map.');
        clearFlow();
        setResult({ state: 'ready', scene, error: '' });
        report('shown', { mapped: scene.values.length,
          sourceCount: document.rows.filter(row => !packet.period || row.period === packet.period).length });
      } catch (error) {
        if (!controller.signal.aborted && generation === generationRef.current) {
          setResult(previous => ({ ...previous, state: previous.scene ? 'ready' : 'error', analysisProjection: false, error: error.message }));
          report('error', { error: String(error.message).slice(0, 1000) });
        }
      }
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); abortRef.current?.abort(); };
  }, [context, version, facilities, connections, setResult, clearFlow]);
}
