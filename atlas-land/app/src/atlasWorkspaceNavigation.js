// Atlas uses a small navigation vocabulary for its map-first workspace.
export const ATLAS_WORKSPACE_AREAS = Object.freeze([
  { id: 'geography', label: 'Model', summary: 'Geography, topology & resolution' },
  { id: 'filters', label: 'Visualise', summary: 'Results, comparison & regions' },
]);

export const ATLAS_DOMAIN_WORKSPACE_AREAS = Object.freeze({
  model: 'geography',
  operate: 'geography',
  visualise: 'filters',
  explore: 'filters',
});

export function atlasWorkspaceAreaForDomain(domain) {
  return ATLAS_DOMAIN_WORKSPACE_AREAS[String(domain || '').toLowerCase()] || null;
}

export function atlasWorkspaceAreaDefinition(id) {
  const canonical = id === 'operations' ? 'geography' : id === 'clusters' ? 'filters' : id;
  return ATLAS_WORKSPACE_AREAS.find((area) => area.id === canonical) || ATLAS_WORKSPACE_AREAS[0];
}

// A bound-model preview uses the same tabs as the hosted Atlas. Embedding
// governs Nohm portal access, not which map workspace can be viewed.
export function atlasUsesWorkspaceTabs(embedded = false, mode) {
  return embedded || mode === 'model' || mode === 'catalogue';
}

export function atlasWorkspaceAreaIsVisible(id, activeArea, tabsEnabled = false) {
  return !tabsEnabled || atlasWorkspaceAreaDefinition(id).id === atlasWorkspaceAreaDefinition(activeArea).id;
}

export function atlasWorkspaceAreaIndex(id) {
  const index = ATLAS_WORKSPACE_AREAS.findIndex((area) => area.id === id);
  return index < 0 ? 0 : index;
}

export function nextAtlasWorkspaceArea(id, key) {
  const index = atlasWorkspaceAreaIndex(id);
  if (key === 'Home') return ATLAS_WORKSPACE_AREAS[0].id;
  if (key === 'End') return ATLAS_WORKSPACE_AREAS.at(-1).id;
  if (key !== 'ArrowDown' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowLeft') return id;
  const direction = key === 'ArrowDown' || key === 'ArrowRight' ? 1 : -1;
  return ATLAS_WORKSPACE_AREAS[(index + direction + ATLAS_WORKSPACE_AREAS.length) % ATLAS_WORKSPACE_AREAS.length].id;
}
