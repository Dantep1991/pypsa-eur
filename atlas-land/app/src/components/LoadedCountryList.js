import React, { useId, useRef, useState } from 'react';
import { ChevronDown, Search, XCircle } from 'lucide-react';

const PREVIEW_COUNT = 6;

// Country membership stays owned by App. This component only changes how the
// selection is displayed; collapsing/searching never changes the loaded map.
export default function LoadedCountryList({ networks, activeCountryCode, disabled, showResolution = false, onActivate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const toggleRef = useRef(null);
  const listId = useId();
  const large = networks.length > PREVIEW_COUNT;
  const open = large && expanded;
  const normalized = query.trim().toLocaleLowerCase();
  const preview = networks.slice(0, PREVIEW_COUNT);
  const active = networks.find((network) => network.countryCode === activeCountryCode);
  if (active && !preview.includes(active)) preview[PREVIEW_COUNT - 1] = active;
  const visible = !large ? networks : !open ? preview : networks.filter((network) => (
    `${network.countryName} ${network.countryCode}`.toLocaleLowerCase().includes(normalized)
  ));
  const collapse = () => {
    setExpanded(false);
    setQuery('');
    toggleRef.current?.focus();
  };
  if (!networks.length) return null;
  return (
    <div className="space-y-2">
      {large && (
        <button type="button" ref={toggleRef} aria-expanded={open} aria-controls={listId}
          onClick={() => open ? collapse() : setExpanded(true)}
          className="flex w-full items-center justify-between rounded-lg border border-white/15 px-2.5 py-2 text-xs text-slate-200 hover:bg-white/5"
        >
          <span>{open ? 'Collapse countries' : `Manage ${networks.length} countries`}</span>
          <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {open && (
        <label className="relative block">
          <Search aria-hidden="true" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          <input type="search" aria-label="Search loaded countries" placeholder="Find a selected country…"
            value={query} onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              if (query) setQuery(''); else collapse();
            }}
            className="w-full rounded-lg border border-white/20 bg-[#081523] py-2 pl-8 pr-2 text-xs text-white placeholder:text-slate-400"
          />
        </label>
      )}
      <div id={listId} aria-label="Loaded countries"
        className={`flex flex-wrap gap-1.5 ${open ? 'max-h-40 overflow-y-auto pr-1' : ''}`}
      >
        {visible.map((network) => {
          const selected = network.countryCode === activeCountryCode;
          return (
            <span key={network.countryCode} className={`inline-flex max-w-full items-center rounded-full border p-0.5 ${selected ? 'border-tj-gold/55 bg-tj-gold/15' : 'border-white/15 bg-white/[0.035]'}`}>
              <button type="button" onClick={() => onActivate(network)} disabled={disabled}
                aria-label={network.countryName} aria-pressed={selected}
                title={`Focus ${network.countryName}${showResolution && network.resolutionLabel ? ` · ${network.resolutionLabel}` : ''}`}
                className={`min-h-[28px] min-w-0 break-words rounded-full px-2 text-xs disabled:opacity-50 ${selected ? 'font-semibold text-tj-gold' : 'text-slate-200 hover:text-white'}`}
              >
                {network.countryName}
                {showResolution && network.resolutionLabel && (
                  <span aria-hidden="true" className="ml-1 text-[9px] font-normal opacity-70">· {network.resolutionLabel}</span>
                )}
              </button>
              <button type="button" onClick={() => onRemove(network.countryCode)} disabled={disabled}
                aria-label={`Remove ${network.countryName}`} title={`Remove ${network.countryName}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
              ><XCircle aria-hidden="true" className="h-3.5 w-3.5" /></button>
            </span>
          );
        })}
        {!visible.length && <p role="status" className="px-1 py-2 text-xs text-slate-300">No selected countries match “{query}”.</p>}
      </div>
      {large && <p className="text-[11px] text-slate-300" aria-live="polite">
        {open ? `${visible.length} of ${networks.length} countries` : `${networks.length} countries loaded · ${networks.length - preview.length} more in Manage`}
      </p>}
    </div>
  );
}
