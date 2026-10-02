import { adaptModelResultScene, MODEL_RESULT_SCENE_SCHEMA } from './resultScene';
import { COMPARISON_COLORS } from './resultColors';

export function comparisonColour(delta, preference) {
  if (!Number.isFinite(delta) || delta === 0 || !['increase', 'decrease'].includes(preference)) return COMPARISON_COLORS.neutral;
  const favourable = preference === 'increase' ? delta > 0 : delta < 0;
  return favourable ? COMPARISON_COLORS.favourable : COMPARISON_COLORS.unfavourable;
}

function physicalDirection(row) {
  if (row.value === 0) return null;
  const from = row.actual_from_node || (row.value < 0 ? row.to_node : row.from_node);
  const to = row.actual_to_node || (row.value < 0 ? row.from_node : row.to_node);
  return from && to && from !== to ? [from, to] : null;
}

export function compareResultScenes(baseline, candidate, preference = 'context_dependent') {
  if (baseline.schema !== MODEL_RESULT_SCENE_SCHEMA || candidate.schema !== MODEL_RESULT_SCENE_SCHEMA) throw new Error('Choose two validated result scenes.');
  for (const key of ['class_name', 'property_name', 'period', 'category', 'map_target']) {
    if ((baseline.selection[key] || '') !== (candidate.selection[key] || '')) throw new Error(`Comparison ${key} does not match.`);
  }
  if (!baseline.legend.unit || baseline.legend.unit !== candidate.legend.unit) throw new Error('Comparison requires identical physical units.');
  if (baseline.spatial_nodes?.length && candidate.spatial_nodes?.length) validateComparisonTopology(
    { facilities: baseline.spatial_nodes, connections: baseline.spatial_links },
    { facilities: candidate.spatial_nodes, connections: candidate.spatial_links });
  const index = scene => {
    const rows = new Map();
    for (const row of scene.values) {
      if (rows.has(row.entity_id) || !Number.isFinite(row.value)) throw new Error('Comparison contains duplicate or invalid observations.');
      rows.set(row.entity_id, row);
    }
    return rows;
  };
  const before = index(baseline), after = index(candidate);
  const values = [...after].flatMap(([id, row]) => {
    const base = before.get(id);
    if (!base) return []; // Missing records are not zero.
    if (base.spatial_binding_valid === false || row.spatial_binding_valid === false) return [];
    if (base.from_node && base.to_node && row.from_node && row.to_node
      && [base.from_node, base.to_node].sort().join('|') !== [row.from_node, row.to_node].sort().join('|')) {
      throw new Error(`Canonical connection ${id} has different result endpoints across models.`);
    }
    if ((base.unit && base.unit !== baseline.legend.unit) || (row.unit && row.unit !== candidate.legend.unit)) throw new Error('Comparison rows have inconsistent physical units.');
    const direction = candidate.selection.direction_supported && physicalDirection(row);
    const previous = baseline.selection.direction_supported && physicalDirection(base);
    const reversed = Boolean(direction && previous && direction[0] === previous[1] && direction[1] === previous[0]);
    // Keep a common declared orientation when equivalent source schemas reverse endpoints.
    const orientationChanged = base.from_node && base.to_node && row.from_node === base.to_node && row.to_node === base.from_node;
    const candidateValue = candidate.selection.direction_supported && orientationChanged ? -row.value : row.value;
    const desirabilityDelta = candidate.selection.direction_supported ? Math.abs(row.value) - Math.abs(base.value) : candidateValue - base.value;
    return [{ ...row, value: candidateValue - base.value, baseline_value: base.value, candidate_value: row.value,
      candidate_comparison_value: candidateValue, flow_direction_changed: reversed,
      baseline_from_node: previous?.[0] || '', baseline_to_node: previous?.[1] || '',
      desirability_delta: desirabilityDelta, comparison_color: comparisonColour(desirabilityDelta, preference) }];
  });
  if (!values.length) throw new Error('No common canonical records exist in these results.');
  return adaptModelResultScene({ ...candidate,
    run: { run_id: `${baseline.run.run_id} → ${candidate.run.run_id}`, label: `${baseline.run.label} → ${candidate.run.label}` },
    // Signed changes cannot be encoded as non-negative pie segments.
    selection: { ...candidate.selection, map_mode: candidate.selection.map_mode === 'mix' ? 'bubbles' : candidate.selection.map_mode },
    values, comparison: { preference, baseline: baseline.run, candidate: candidate.run,
      baseline_project: baseline.project_id, candidate_project: candidate.project_id,
      baseline_version: baseline.model_version, candidate_version: candidate.model_version,
      matched: values.length, baseline_only: [...before.keys()].filter(id => !after.has(id)).length,
      direction_changed: values.filter(row => row.flow_direction_changed).length,
      candidate_only: [...after.keys()].filter(id => !before.has(id)).length },
    legend: { ...candidate.legend, scale: 'comparison', minimum: Math.min(...values.map(row => row.value)),
      maximum: Math.max(...values.map(row => row.value)), maximum_magnitude: Math.max(...values.map(row => Math.abs(row.value))) },
  });
}

export function validateComparisonTopology(baseline, candidate) {
  const nodes = rows => new Map((rows || []).map(row => [row.id, [row.latitude, row.longitude].map(Number)]));
  const a = nodes(baseline.facilities), b = nodes(candidate.facilities);
  let matched = 0;
  for (const [id, point] of a) {
    if (!b.has(id)) continue;
    const other = b.get(id);
    if (!point.every((coordinate, i) => Number.isFinite(coordinate) && Math.abs(coordinate - other[i]) < 0.0001)) throw new Error(`Canonical node ${id} has different coordinates across models.`);
    matched += 1;
  }
  if (!matched) throw new Error('These model topologies have no common canonical nodes.');
  const endpoints = new Map((baseline.connections || []).map(row => [row.id, [row.from, row.to].sort().join('|')]));
  for (const row of candidate.connections || []) {
    if (endpoints.has(row.id) && endpoints.get(row.id) !== [row.from, row.to].sort().join('|')) throw new Error(`Canonical connection ${row.id} has different endpoints across models.`);
  }
}
