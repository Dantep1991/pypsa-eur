import React, { useMemo } from 'react';
import { Loader2, X } from 'lucide-react';
import ModelControlHelp from './ModelControlHelp';

export default function ModelCountryScopeControls({
  availableCountries,
  selectedCountries,
  busy,
  disabled,
  countryName,
  onSelect,
  onSelectAll,
}) {
  const available = useMemo(
    () => [...new Set((availableCountries || []).map(code => String(code || '').trim().toUpperCase()).filter(Boolean))].sort(),
    [availableCountries],
  );
  const selected = useMemo(
    () => (selectedCountries || []).filter(code => available.includes(code)),
    [available, selectedCountries],
  );
  const remaining = available.filter(code => !selected.includes(code));
  const controlsDisabled = disabled || busy;

  const applySelection = (countries) => {
    onSelect([...new Set(countries)].sort());
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="block text-[9px] uppercase tracking-wider text-tj-slate">Country scope</span>
          <span className="mt-0.5 block text-[10px] leading-4 text-tj-slate">
            {selected.length ? `${selected.length} of ${available.length} countries selected` : `All ${available.length} project countries`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ModelControlHelp label="Country scope">
            <p>Filter the countries already in this project model. This previews a subset of its existing nodes and links; it does not load separate country networks.</p>
            <p>Country selection preserves the current geography, including mixed-resolution views.</p>
          </ModelControlHelp>
          <button
            type="button"
            onClick={onSelectAll}
            disabled={controlsDisabled || !selected.length}
            className="shrink-0 rounded-lg border border-tj-gold/30 bg-tj-gold/10 px-2 py-1 text-[9px] font-semibold text-tj-gold disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-tj-slate disabled:opacity-70"
          >
            {selected.length ? 'Select all' : 'All selected'}
          </button>
        </div>
      </div>

      <div className="mt-2 flex gap-1.5">
        <select
          value=""
          onChange={event => { if (event.target.value) applySelection([...selected, event.target.value]); }}
          disabled={controlsDisabled || !remaining.length}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50"
          aria-label="Add country to model view"
        >
          <option value="">Add a country…</option>
          {remaining.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
        </select>
        {busy && <span role="status" aria-label="Updating country view"><Loader2 className="h-4 w-4 animate-spin" /></span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {selected.length ? selected.map(code => (
          <button
            key={code}
            type="button"
            onClick={() => applySelection(selected.filter(item => item !== code))}
            disabled={controlsDisabled}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-1 text-[9px] text-white disabled:opacity-50"
            title={`Remove ${countryName(code)}`}
          >
            {countryName(code)} <X className="h-2.5 w-2.5 text-tj-slate" />
          </button>
        )) : (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2 py-1 text-[9px] text-emerald-100">
            Full project extent
          </span>
        )}
      </div>

    </div>
  );
}
