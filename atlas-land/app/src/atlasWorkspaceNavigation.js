// Atlas uses a deliberately small navigation vocabulary.  It is a map-first
// workspace today, but these stable areas give future Atlas portals a place to
// land without turning the map controls into a long, premature product menu.
export const ATLAS_WORKSPACE_AREAS = Object.freeze([
  { id: 'geography', label: 'Model', summary: 'Geography, topology & resolution' },
  { id: 'operations', label: 'Operate', summary: 'Build, solve & operations' },
  { id: 'filters', label: 'Visualise', summary: 'Layers, carriers & display' },
  { id: 'clusters', label: 'Explore', summary: 'Eurostat & regional clustering' },
]);

export const ATLAS_DOMAIN_WORKSPACE_AREAS = Object.freeze({
  model: 'geography',
  operate: 'operations',
  visualise: 'filters',
  explore: 'clusters',
});

export function atlasWorkspaceAreaForDomain(domain) {
  return ATLAS_DOMAIN_WORKSPACE_AREAS[String(domain || '').toLowerCase()] || null;
}

export function atlasWorkspaceAreaDefinition(id) {
  return ATLAS_WORKSPACE_AREAS.find((area) => area.id === id) || ATLAS_WORKSPACE_AREAS[0];
}

// The Nohm shell owns domain navigation when Atlas is embedded. Standalone
// Atlas keeps the complete workspace so it remains useful outside Nohm.
export function atlasWorkspaceAreaIsVisible(id, activeArea, embedded = false) {
  return !embedded || id === atlasWorkspaceAreaDefinition(activeArea).id;
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
