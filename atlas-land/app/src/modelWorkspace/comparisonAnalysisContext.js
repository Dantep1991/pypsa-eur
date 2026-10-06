// A planning hint, not data or a semantic router. The shared agent reads the
// complete, validated query pointers through the analysis bridge.
export function comparisonAnalysisContext(scene) {
  const pair = scene?.comparison;
  if (!pair) return null;
  return {
    kind: 'solved_result_comparison', delta: 'candidate_minus_baseline',
    baseline: { projectId: pair.baseline_project, modelVersion: pair.baseline_version, runId: pair.baseline?.run_id },
    candidate: { projectId: pair.candidate_project, modelVersion: pair.candidate_version, runId: pair.candidate?.run_id },
    className: scene.selection?.class_name, propertyName: scene.selection?.property_name,
    period: scene.selection?.period, category: scene.selection?.category,
    instruction: 'Questions analysing this comparison belong to Nohm’s shared Emil agent. Delegate without changing the map. The shared agent has both source queries and supports shallow or deep comparison. Map colours alone are not analytical evidence.',
  };
}
