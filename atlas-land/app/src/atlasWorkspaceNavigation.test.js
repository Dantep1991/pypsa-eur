import { ATLAS_WORKSPACE_AREAS, atlasWorkspaceAreaIsVisible, atlasWorkspaceAreaForDomain, nextAtlasWorkspaceArea } from './atlasWorkspaceNavigation';
test('two workspace tabs preserve operations and clustering in their new homes', () => {
  expect(ATLAS_WORKSPACE_AREAS.map(area => area.label)).toEqual(['Model', 'Visualise']);
  expect(atlasWorkspaceAreaIsVisible('operations', 'geography', true)).toBe(true);
  expect(atlasWorkspaceAreaIsVisible('clusters', 'filters', true)).toBe(true);
  expect(atlasWorkspaceAreaIsVisible('geography', 'filters', true)).toBe(false);
  expect(atlasWorkspaceAreaForDomain('operate')).toBe('geography');
  expect(atlasWorkspaceAreaForDomain('explore')).toBe('filters');
  expect(nextAtlasWorkspaceArea('geography', 'ArrowRight')).toBe('filters');
});
