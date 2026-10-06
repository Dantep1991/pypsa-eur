import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X } from 'lucide-react';
import './AtlasWorkspacePanels.css';
import { useWorkspaceAgentRegistry } from '../agentWorkspace/react';

const WorkspacePanels = createContext(null);

// Settings live beside the map, not inside the navigation menu. Portals keep
// their existing React state and theme context without making the map modal.
export function AtlasWorkspacePanels({ children, onActivate, externalPanelOpen, externalPanelSelection, externalPanelParent }) {
  const [active, setActive] = useState(null);
  const [selected, setSelected] = useState(null);
  const [host, setHost] = useState(null);
  const panelVisible = Boolean(active && !externalPanelOpen);
  const trigger = useRef(null);
  const closeButton = useRef(null);
  const close = () => {
    setActive(null);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!externalPanelOpen) return;
    // A child card temporarily replaces its parent, without losing its controls
    // or selection. Closing the child returns to the same settings.
    setActive(externalPanelParent || null);
    if (externalPanelSelection) setSelected(externalPanelSelection);
  }, [externalPanelOpen, externalPanelSelection, externalPanelParent]);
  useEffect(() => {
    if (!panelVisible) return undefined;
    closeButton.current?.focus();
    const escape = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        setActive(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [active, panelVisible]);
  const activate = (title, element, onOpen, source) => {
    trigger.current = element;
    setSelected(title);
    setActive(onOpen ? null : title);
    onActivate?.(title, source);
    if (onOpen) onOpen();
  };
  return <WorkspacePanels.Provider value={{ active: panelVisible ? active : null,
    selected: externalPanelOpen && externalPanelSelection ? externalPanelSelection : selected, host, activate }}>
    {children}
    <aside className="atlas-workspace-panel" aria-label={active || 'Workspace settings'} hidden={!panelVisible}>
      <header>
        <h2>{active}</h2>
        <button ref={closeButton} type="button" onClick={close} aria-label={`Close ${active || 'workspace'}`}><X size={18} /></button>
      </header>
      <div ref={setHost} className="atlas-workspace-panel__body" />
    </aside>
  </WorkspacePanels.Provider>;
}

export function WorkspaceLauncher({ title, Icon, children, onOpen, disabled, disabledReason, badge, help }) {
  const panels = useContext(WorkspacePanels);
  const agent = useWorkspaceAgentRegistry();
  const [visited, setVisited] = useState(false);
  const open = panels?.active === title;
  const selected = panels?.selected === title;
  useEffect(() => { if (open) setVisited(true); }, [open]);
  useEffect(() => {
    if (!agent || !panels || disabled) return undefined;
    const activate = () => panels.activate(title, null, onOpen, { agent: true });
    agent.launchers.set(title, activate);
    return () => { if (agent.launchers.get(title) === activate) agent.launchers.delete(title); };
  }, [agent, panels, title, onOpen, disabled]);
  if (!panels) return null;
  return <section className="atlas-workspace-launcher">
    <button type="button" disabled={disabled} aria-label={title} title={disabledReason}
      aria-expanded={onOpen ? undefined : open}
      aria-current={selected ? 'page' : undefined}
      className={selected ? 'is-active' : ''}
      onClick={event => panels.activate(title, event.currentTarget, onOpen)}>
      <span className="atlas-domain-section__icon">{Icon && <Icon size={17} />}</span>
      <span className="atlas-workspace-launcher__title">{title}</span>
      {badge && <span className="atlas-workspace-launcher__badge">{badge}</span>}
      <ChevronRight size={16} />
    </button>
    {(open || visited) && !disabled && panels.host && createPortal(<div hidden={!open}>
      {children}
      {help && <details className="atlas-workspace-panel__help"><summary>About this tool</summary>{help}</details>}
    </div>, panels.host)}
  </section>;
}

export const useWorkspacePanels = () => useContext(WorkspacePanels);
