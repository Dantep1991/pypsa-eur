import { ATLAS_WORKSPACE_AREAS, atlasUsesWorkspaceTabs, atlasWorkspaceAreaIsVisible, atlasWorkspaceAreaForDomain, nextAtlasWorkspaceArea } from './atlasWorkspaceNavigation';
test('two workspace tabs preserve operations and clustering in their new homes', () => {
  expect(ATLAS_WORKSPACE_AREAS.map(area => area.label)).toEqual(['Model', 'Visualise']);
  expect(atlasWorkspaceAreaIsVisible('operations', 'geography', true)).toBe(true);
  expect(atlasWorkspaceAreaIsVisible('clusters', 'filters', true)).toBe(true);
  expect(atlasWorkspaceAreaIsVisible('geography', 'filters', true)).toBe(false);
  expect(atlasWorkspaceAreaForDomain('operate')).toBe('geography');
  expect(atlasWorkspaceAreaForDomain('explore')).toBe('filters');
  expect(nextAtlasWorkspaceArea('geography', 'ArrowRight')).toBe('filters');
});

test.each([[false, 'model', true], [true, 'model', true], [true, 'reference', true], [false, 'reference', false], [false, undefined, false]])(
  'workspace tab routing follows model context, not only embedding (%s, %s)', (embedded, mode, expected) => {
    const enabled = atlasUsesWorkspaceTabs(embedded, mode);
    expect(enabled).toBe(expected);
    expect(atlasWorkspaceAreaIsVisible('geography', 'filters', enabled)).toBe(!expected);
    expect(atlasWorkspaceAreaIsVisible('filters', 'filters', enabled)).toBe(true);
  }
);
