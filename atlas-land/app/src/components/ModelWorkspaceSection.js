import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ModelControlHelp from './ModelControlHelp';

export default function ModelWorkspaceSection({
  title,
  summary,
  Icon,
  children,
  defaultOpen = false,
  badge = '',
  ariaLabel,
  help,
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-white/10" aria-label={ariaLabel || title}>
      <div className="flex items-start">
        <button
          type="button"
          onClick={() => setOpen(previous => !previous)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 px-3 py-3 text-left transition hover:bg-white/[0.025]"
        >
          <span className={`atlas-domain-section__icon ${open ? 'is-active' : ''}`}>
            {Icon ? <Icon className="h-4 w-4" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="atlas-domain-section__eyebrow">Model workspace</span>
            <span className="atlas-domain-section__title">{title}</span>
            <span className="atlas-domain-section__summary">{summary}</span>
          </span>
          {badge ? <span className="mt-0.5 shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] text-tj-slate">{badge}</span> : null}
          <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-tj-slate transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {help && <div className="pr-3 pt-3"><ModelControlHelp label={title}>{help}</ModelControlHelp></div>}
      </div>
      {open ? <div className="px-3 pb-3 text-xs">{children}</div> : null}
    </section>
  );
}
