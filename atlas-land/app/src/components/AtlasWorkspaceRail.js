import React from 'react';
import { ATLAS_WORKSPACE_AREAS, nextAtlasWorkspaceArea } from '../atlasWorkspaceNavigation';

export default function AtlasWorkspaceRail({ activeArea, onSelect }) {
  const handleKeyDown = (event) => {
    const next = nextAtlasWorkspaceArea(activeArea, event.key);
    if (next === activeArea) return;
    event.preventDefault();
    onSelect(next);
    window.requestAnimationFrame(() => document.querySelector(`[data-atlas-workspace-area="${next}"]`)?.focus());
  };

  return (
    <nav className="atlas-workspace-rail" aria-label="Atlas workspace areas" onKeyDown={handleKeyDown}>
      <p className="atlas-workspace-rail__label">Workspace</p>
      <div className="atlas-workspace-rail__areas">
        {ATLAS_WORKSPACE_AREAS.map((area) => {
          const current = activeArea === area.id;
          return (
            <button
              key={area.id}
              type="button"
              data-atlas-workspace-area={area.id}
              className={`atlas-workspace-rail__area${current ? ' is-active' : ''}`}
              aria-current={current ? 'page' : undefined}
              aria-label={`${area.label}: ${area.summary}`}
              onClick={() => onSelect(area.id)}
            >
              <span>{area.label}</span>
              <small>{area.summary}</small>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
