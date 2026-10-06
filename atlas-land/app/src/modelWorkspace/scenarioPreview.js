import { modelConnection } from './modelScene';

export const SCENARIO_PREVIEW_MESSAGE = 'nohm.atlas.scenario-preview.v1';
export const SCENARIO_PREVIEW_ACK = 'nohm.atlas.scenario-preview-ack.v1';

export function previewMatchesScene(report, scene) {
  return report?.schema === SCENARIO_PREVIEW_MESSAGE && typeof report.preview_id === 'string'
    && report.project_id === scene?.meta?.projectId && report.model_version === scene?.meta?.version
    && report.model_name === scene?.meta?.modelName && Array.isArray(report.objects) && Array.isArray(report.changes);
}

export function projectScenarioPreview(scene, report) {
  if (!previewMatchesScene(report, scene)) return scene;
  const states = new Map(report.objects.map(item => [item.object_id, item]));
  const changes = new Map();
  report.changes.forEach(row => changes.set(row.object_id, [...(changes.get(row.object_id) || []), row]));
  const decorate = record => {
    const state = states.get(record.id);
    if (!state) return record;
    const status = state.disabled ? 'disabled' : state.unresolved ? 'unresolved' : state.changed ? 'changed' : 'unchanged';
    const next = { ...record, scenario_preview: { status, inputDate: report.input_date, modelName: report.model_name,
      scenarios: report.scenarios, changes: changes.get(record.id) || [] },
      atlas_scenario_color: status === 'disabled' ? 'var(--accent-error)' : status === 'changed' ? 'var(--accent-primary-ui)' : status === 'unresolved' ? 'var(--text-muted)' : null };
    if (record.component_type === 'Line') {
      const values = state.values || {};
      const active = Number.isFinite(values.Units) && values.Units > 0 && !(values['Max Flow'] === 0 && values['Min Flow'] === 0);
      next.operational_state = { status: state.disabled ? 'disabled' : active ? 'active' : 'unknown', reason: state.reason,
        input_date: report.input_date, model_name: report.model_name, scenarios: report.scenarios };
    }
    return next;
  };
  const nodes = new Set(scene.facilities.filter(row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)).map(row => row.id));
  const existing = new Set(scene.connections.map(row => row.id));
  // Alternative saved Line objects may be absent from the base carrier view.
  // Only explicit schema endpoints already in the native map can add geometry.
  const additional = report.objects.filter(state => state.connection?.id === state.object_id
    && state.object_id.startsWith('Line:') && !existing.has(state.object_id)
    && (state.changed || state.disabled)
    && nodes.has(state.connection.from_node) && nodes.has(state.connection.to_node))
    .map(state => ({ ...modelConnection(state.connection, scene.scene || {
      project_id: scene.meta.projectId, version: scene.meta.version, model_scope: { model_name: scene.meta.modelName },
    }), atlas_scenario_additional: true }));
  return { ...scene, facilities: scene.facilities.map(decorate), connections: [...scene.connections, ...additional].map(decorate) };
}

export function mappedPreviewCount(scene, report) {
  const projected = projectScenarioPreview(scene, report);
  const nodes = new Set(projected.facilities.filter(row => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)).map(row => row.id));
  const ids = new Set([...nodes, ...projected.connections.filter(row => nodes.has(row.fromNode || row.from) && nodes.has(row.toNode || row.to)).map(row => row.id)]);
  return report.objects.filter(row => ids.has(row.object_id)).length;
}
