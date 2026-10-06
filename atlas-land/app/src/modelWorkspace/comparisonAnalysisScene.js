import { adaptModelResultScene } from './resultScene';
import { compareResultScenes } from './resultComparison';
import { resultMapModes } from './resultPresentation';

// Reuse the ordinary comparison renderer: no second colour/geometry system.
export function comparisonAnalysisScene(document, period) {
  const rows = document.rows.filter(row => !period || row.period === period);
  const periods = [...new Set(rows.map(row => row.period))];
  if (periods.length !== 1) throw new Error('Choose a single displayed period before mapping comparison data.');
  const cls = document.class_name, property = document.comparison.displayed_property || document.comparison.property_name;
  const quantity = { class_name: cls, property_name: property, unit: document.unit, supports_flow_map: true };
  const mode = resultMapModes(quantity)[0].id;
  const arm = role => {
    const pointer = document.comparison[role];
    const values = rows.map(row => ({ ...row, value: row.inputs[role] }));
    if (values.some(row => !Number.isFinite(row.value))) throw new Error('Invalid comparison observations.');
    return adaptModelResultScene({ schema: 'nohm.atlas.result-scene.v2', project_id: pointer.project_id,
      model_version: pointer.model_version, run: { run_id: pointer.run_id, label: pointer.run_id },
      analysis_query: document.queries[role].query,
      derivation: document.comparison.derivation || '',
      selection: { class_name: cls, property_name: property, category: document.category,
        period: periods[0], period_label: periods[0], map_target: ['Line', 'Gas Pipeline'].includes(cls) ? 'link' : 'node',
        map_mode: mode, direction_supported: mode === 'flow' },
      values, legend: { unit: document.unit, scale: 'sequential' },
      coverage: { source_row_count: values.length, projected_row_count: values.length } });
  };
  const scene = compareResultScenes(arm('baseline'), arm('candidate'), document.comparison.preference);
  // The service only admits the same schema version for both sources. For
  // derived signed flows, geometry arrives after comparison; their common
  // declared orientation still makes opposite non-zero signs a reversal.
  if (mode === 'flow') {
    scene.values = scene.values.map(row => ({ ...row,
      flow_direction_changed: row.flow_direction_changed || (row.baseline_value * row.candidate_value < 0) }));
    scene.comparison.direction_changed = scene.values.filter(row => row.flow_direction_changed).length;
  }
  return adaptModelResultScene({ ...scene, analysis_artifact: document.analysis_id });
}
