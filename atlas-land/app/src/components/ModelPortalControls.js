import React, { useEffect, useState } from 'react';
import { Activity, BarChart3, CloudSun, Gem, Network, PanelRightOpen, PlayCircle, ShieldCheck } from 'lucide-react';
import './ModelPortalControls.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { enumField } from '../agentWorkspace/registry';

const PORTALS = [
  {
    id: 'explore-model',
    label: 'Explore model',
    description: 'Inspect the active model without leaving the map.',
    Icon: Activity,
  },
  {
    id: 'demand',
    label: 'Demand profiles',
    description: 'Open the project demand workspace beside Atlas.',
    Icon: PanelRightOpen,
  },
  {
    id: 'model-operations',
    label: 'Model Operations',
    description: 'Open Nohm\'s governed operations workspace for this model.',
    Icon: ShieldCheck,
  },
  {
    id: 'model-runs',
    label: 'Run model',
    description: 'Validate, launch and monitor model runs in Nohm.',
    Icon: PlayCircle,
  },
  {
    id: 'climate',
    label: 'Climate',
    description: 'Inspect linked climate profiles and weather evidence for this project.',
    Icon: CloudSun,
  },
  {
    id: 'commodity',
    label: 'Commodity',
    description: 'Inspect linked commodity assumptions and price trajectories.',
    Icon: Gem,
  },
  {
    id: 'synapse-network',
    label: 'Synapse network',
    description: 'Open Diology with the active model network selected.',
    Icon: Network,
  },
  {
    id: 'visualisation',
    label: 'Visualisation',
    description: 'Open the project solution charts and visualisations.',
    Icon: BarChart3,
  },
];

export default function ModelPortalControls({ embedded = false, onOpen, targets = null }) {
  const registry = useWorkspaceAgentRegistry();
  const [portal, setPortal] = useState(null);
  const visiblePortals = Array.isArray(targets)
    ? [...new Set(targets)].map(id => PORTALS.find(portal => portal.id === id)).filter(Boolean)
    : PORTALS;
  useEffect(() => {
    const receive = event => {
      const packet = event.data;
      if (!embedded || event.source !== window.parent || event.origin !== window.location.origin
        || packet?.type !== 'nohm.atlas.portal-state.v1' || packet.binding !== registry?.snapshot().binding
        || !['opening', 'opened', 'closed'].includes(packet.status)
        || (packet.status !== 'closed' && !visiblePortals.some(row => row.id === packet.target))) return;
      setPortal({ binding: packet.binding, target: packet.target || '', status: packet.status, contextApplied: packet.contextApplied === true });
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [embedded, registry, visiblePortals]);
  useWorkspaceAgentController('project_tools', {
    ready: true, fields: { target: enumField('Project portal', visiblePortals.map(row => ({ value: row.id, label: row.label }))) },
    actions: { show: { description: 'Open an existing project portal in Nohm and await host confirmation. This does not launch a model run.' } },
    state: { embedded, portal: portal?.binding === registry?.snapshot().binding ? portal : null },
  }, async (_action, values) => {
    if (!embedded) throw new Error('Open Atlas inside Nohm to use the project portals.');
    if (!values.target || onOpen(values.target) === false) throw new Error('Choose an available project portal.');
    await registry.wait('project_tools', entry => entry?.state.portal?.target === values.target
      && entry.state.portal.status === 'opened', 20000);
    return 'Project portal opened.';
  });
  return (
    <div className="model-portal-controls">
      {visiblePortals.map(({ id, label, description, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={!embedded}
          onClick={() => onOpen(id)}
          className="model-portal-link"
          aria-label={`Open ${label} portal`}
          title={description}
        >
          <Icon size={18} className="model-portal-link__icon" />
          <span>{label}</span>
          <PanelRightOpen size={15} className="model-portal-link__arrow" />
        </button>
      ))}
      {!embedded && (
        <p>Open Atlas inside Nohm to use these tools.</p>
      )}
    </div>
  );
}
