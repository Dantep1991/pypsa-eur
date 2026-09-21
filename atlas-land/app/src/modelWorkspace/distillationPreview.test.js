import {
  adaptDistillationPreview,
  decorateDistillationRecord,
  distillationPreviewRequestUrl,
} from './distillationPreview';

const payload = {
  schema: 'nohm.atlas.distillation-preview.v1',
  project_id: 'TYNDP_2026_Scenarios',
  model_version: 'v3.0.0',
  selection: { country_codes: ['ES'], mapping_version: 'model-scene-country.v1' },
  source: { scene_fingerprint: 'sha256:abc' },
  classifications: [
    { entity_id: 'Node:ES00', source_id: 'Node:ES00', status: 'retained', reason: 'selected', reason_code: 'node_country_selected' },
    { entity_id: 'Node:FR00', source_id: 'Node:FR00', status: 'excluded', reason: 'outside', reason_code: 'node_country_not_selected' },
    { entity_id: 'Line:ES00-FR00', source_id: 'Line:ES00-FR00', status: 'boundary_crossing', reason: 'cut', reason_code: 'link_crosses_selection_boundary' },
  ],
  counts: { source: { total: 3 }, reconciliation: { source_total: 3, classified_total: 3, identity_delta: 0 } },
  capabilities: { mutates_source: false, executable: false, can_run: false, can_publish: false },
};

test('builds an explicit model-version and country-scoped request', () => {
  expect(distillationPreviewRequestUrl(
    { mode: 'model', projectId: 'TYNDP_2026_Scenarios' },
    { countries: ['FR', 'ES', 'ES'], modelVersion: 'v3.0.0', year: 2030, layers: ['grid', 'supply'] },
  )).toBe('/api/emil/atlas/projects/TYNDP_2026_Scenarios/distillation-preview?countries=ES%2CFR&carrier=electricity&layers=grid%2Csupply&version=v3.0.0&year=2030');
});

test('validates reconciled, read-only previews and indexes source identities', () => {
  const preview = adaptDistillationPreview(payload, 'TYNDP_2026_Scenarios', 'v3.0.0');
  expect(preview.classificationByEntityId.get('Line:ES00-FR00').status).toBe('boundary_crossing');
  expect(() => adaptDistillationPreview({
    ...payload,
    counts: { ...payload.counts, reconciliation: { identity_delta: 1 } },
  }, 'TYNDP_2026_Scenarios', 'v3.0.0')).toThrow('does not reconcile');
});

test('shows retained objects, marks cut links, and can ghost or hide excluded context', () => {
  const preview = adaptDistillationPreview(payload);
  const link = decorateDistillationRecord({ id: 'Line:ES00-FR00', properties: [] }, preview, false);
  expect(link.atlas_distillation_status).toBe('boundary_crossing');
  expect(link.atlas_distillation_color).toBe('#f59e0b');
  expect(link.dash_array).toBe('8 5');
  expect(link.atlas_distillation_hidden).toBe(false);

  const hidden = decorateDistillationRecord({ id: 'Node:FR00', properties: [] }, preview, false);
  expect(hidden.atlas_distillation_hidden).toBe(true);
  const ghosted = decorateDistillationRecord({ id: 'Node:FR00', properties: [] }, preview, true);
  expect(ghosted.atlas_distillation_hidden).toBe(false);
  expect(ghosted.atlas_distillation_opacity).toBe(0.16);
});

