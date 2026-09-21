import React from 'react';
import { Activity, PanelRightOpen } from 'lucide-react';

const PORTALS = [
  {
    id: 'explore-model',
    label: 'Explore Model',
    description: 'Inspect the active model without leaving the map.',
    Icon: Activity,
  },
  {
    id: 'demand',
    label: 'Demand',
    description: 'Open the project demand workspace beside Atlas.',
    Icon: PanelRightOpen,
  },
];

export default function ModelPortalControls({ embedded = false, onOpen }) {
  return (
    <div className="space-y-2">
      {PORTALS.map(({ id, label, description, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={!embedded}
          onClick={() => onOpen(id)}
          className="group flex w-full items-start gap-2.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2.5 text-left text-white transition hover:border-tj-gold/35 hover:bg-tj-gold/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
          aria-label={`Open ${label} portal`}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-tj-gold" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold">{label}</span>
            <span className="mt-0.5 block text-[9px] leading-3.5 text-tj-slate">{description}</span>
          </span>
          <PanelRightOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tj-slate transition group-hover:text-tj-gold" />
        </button>
      ))}
      {!embedded && (
        <p className="text-[9px] leading-3.5 text-tj-slate">Portals are available when Atlas is opened inside Nohm.</p>
      )}
    </div>
  );
}
