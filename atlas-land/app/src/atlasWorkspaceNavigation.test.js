import {
  ATLAS_WORKSPACE_AREAS,
  atlasWorkspaceAreaForDomain,
  atlasWorkspaceAreaDefinition,
  atlasWorkspaceAreaIsVisible,
  atlasWorkspaceAreaIndex,
  nextAtlasWorkspaceArea,
} from './atlasWorkspaceNavigation';

test('Atlas workspace navigation remains intentionally limited to four map-first areas', () => {
  expect(ATLAS_WORKSPACE_AREAS.map((area) => area.id)).toEqual(['geography', 'operations', 'filters', 'clusters']);
  expect(ATLAS_WORKSPACE_AREAS.every((area) => area.label && area.summary)).toBe(true);
});

test('Nohm Atlas Domains map to the matching workspace overlays', () => {
  expect(atlasWorkspaceAreaForDomain('model')).toBe('geography');
  expect(atlasWorkspaceAreaForDomain('OPERATE')).toBe('operations');
  expect(atlasWorkspaceAreaForDomain('visualise')).toBe('filters');
  expect(atlasWorkspaceAreaForDomain('explore')).toBe('clusters');
  expect(atlasWorkspaceAreaForDomain('unknown')).toBeNull();
});

test('embedded Atlas exposes only the domain selected by the Nohm shell', () => {
  expect(atlasWorkspaceAreaDefinition('operations')).toMatchObject({
    label: 'Operate',
    summary: 'Build, solve & operations',
  });
  expect(atlasWorkspaceAreaDefinition('unknown').id).toBe('geography');
  expect(ATLAS_WORKSPACE_AREAS.filter((area) => (
    atlasWorkspaceAreaIsVisible(area.id, 'filters', true)
  )).map((area) => area.id)).toEqual(['filters']);
  expect(ATLAS_WORKSPACE_AREAS.every((area) => (
    atlasWorkspaceAreaIsVisible(area.id, 'filters', false)
  ))).toBe(true);
});

test('Atlas workspace keyboard navigation wraps and supports Home and End', () => {
  expect(atlasWorkspaceAreaIndex('unknown')).toBe(0);
  expect(nextAtlasWorkspaceArea('geography', 'ArrowLeft')).toBe('clusters');
  expect(nextAtlasWorkspaceArea('clusters', 'ArrowRight')).toBe('geography');
  expect(nextAtlasWorkspaceArea('filters', 'Home')).toBe('geography');
  expect(nextAtlasWorkspaceArea('filters', 'End')).toBe('clusters');
  expect(nextAtlasWorkspaceArea('filters', 'Enter')).toBe('filters');
});
