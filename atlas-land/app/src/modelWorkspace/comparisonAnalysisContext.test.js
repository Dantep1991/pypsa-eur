import { comparisonAnalysisContext } from './comparisonAnalysisContext';

test('planner knows which comparison to delegate, without receiving painted numbers', () => {
  const hint = comparisonAnalysisContext({ selection: { class_name: 'Node', property_name: 'Price', period: '2030', category: 'Market' },
    values: [{ value: 999 }], comparison: { baseline: { run_id: 'base' }, candidate: { run_id: 'candidate' },
      baseline_project: 'Project', baseline_version: 'v1', candidate_project: 'Other', candidate_version: 'v2' } });
  expect(hint.baseline).toMatchObject({ runId: 'base', projectId: 'Project' });
  expect(hint.candidate).toMatchObject({ runId: 'candidate', projectId: 'Other', modelVersion: 'v2' });
  expect(hint.delta).toBe('candidate_minus_baseline');
  expect(JSON.stringify(hint)).not.toContain('999');
  expect(comparisonAnalysisContext({})).toBeNull();
});
