import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { WorkspaceLauncher, useWorkspacePanels } from './AtlasWorkspacePanels';

export default function AtlasDomainSection({ icon: Icon, title, summary, open, onToggle, compact = false, retain = false, children, disabled = false, disabledReason }) {
  const panels = useWorkspacePanels();
  const [openedOnce, setOpenedOnce] = useState(open);
  useEffect(() => { if (open) setOpenedOnce(true); }, [open]);
  if (panels) return <WorkspaceLauncher title={title} Icon={Icon} disabled={disabled} disabledReason={disabledReason}>{children}</WorkspaceLauncher>;
  const mounted = open || (retain && openedOnce);
  return <section className="atlas-domain-section">
    {!compact && <button type="button" onClick={onToggle} disabled={disabled} title={disabledReason} aria-expanded={open} className="atlas-domain-section__trigger">
      <span className={`atlas-domain-section__icon ${open ? 'is-active' : ''}`}><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="atlas-domain-section__title">{title}</span>
        <span className="atlas-domain-section__summary">{summary}</span>
      </span>
      <ChevronDown className={`atlas-domain-section__chevron h-4 w-4 ${open ? 'rotate-180' : ''}`} />
    </button>}
    {mounted && !disabled && <div hidden={!open} className="px-3 pb-3 text-xs">{children}</div>}
  </section>;
}
