import React, { useEffect, useState } from 'react';
import './ModelGeographyTabs.css';
import { useWorkspaceAgentRegistry } from '../agentWorkspace/react';

export default function ModelGeographyTabs({ network, mixed, networkLabel = 'Network & countries',
  label = 'Geography sections', idPrefix = 'geography', initialTab = 'network' }) {
  const [tab, setTab] = useState(initialTab);
  const agent = useWorkspaceAgentRegistry();
  useEffect(() => {
    if (!agent) return undefined;
    const title = idPrefix === 'model-creation' ? 'Create model' : 'Geography Domain';
    agent.tabs.set(title, setTab);
    return () => { if (agent.tabs.get(title) === setTab) agent.tabs.delete(title); };
  }, [agent, idPrefix]);
  const sections = [['network', networkLabel], ['mixed', 'Mixed resolution']];
  return <div className="model-geography-tabs">
    <div role="tablist" aria-label={label}>
      {sections.map(([id, label], index) => <button key={id} id={`${idPrefix}-tab-${id}`} type="button"
        role="tab" aria-selected={tab === id} aria-controls={`${idPrefix}-panel-${id}`} tabIndex={tab === id ? 0 : -1}
        onClick={() => setTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
          setTab(sections[next][0]);
          event.currentTarget.parentElement.children[next].focus();
        }}>{label}</button>)}
    </div>
    {sections.map(([id]) => <div key={id} id={`${idPrefix}-panel-${id}`} role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${id}`} hidden={tab !== id}>
      {id === 'network' ? network : mixed}
    </div>)}
  </div>;
}
