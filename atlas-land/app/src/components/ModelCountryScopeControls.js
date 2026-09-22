import React, { useMemo, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';

export default function ModelCountryScopeControls({
  availableCountries,
  selectedCountries,
  busy,
  disabled,
  countryName,
  onSelect,
  onSelectAll,
}) {
  const [pendingCountry, setPendingCountry] = useState('');
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
    setPendingCountry('');
  };

  const addCountry = () => {
    if (!pendingCountry) return;
    applySelection([...selected, pendingCountry]);
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
        <button
          type="button"
          onClick={onSelectAll}
          disabled={controlsDisabled || !selected.length}
          className="shrink-0 rounded-lg border border-tj-gold/30 bg-tj-gold/10 px-2 py-1 text-[9px] font-semibold text-tj-gold disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-tj-slate disabled:opacity-70"
        >
          {selected.length ? 'Select all' : 'All selected'}
        </button>
      </div>

      <div className="mt-2 flex gap-1.5">
        <select
          value={pendingCountry}
          onChange={event => setPendingCountry(event.target.value)}
          disabled={controlsDisabled || !remaining.length}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50"
          aria-label="Add country to model view"
        >
          <option value="">Add a country…</option>
          {remaining.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
        </select>
        <button
          type="button"
          onClick={addCountry}
          disabled={controlsDisabled || !pendingCountry}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-tj-gold/35 bg-tj-gold/10 text-tj-gold disabled:opacity-40"
          aria-label="Add country to model view"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
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

      {disabled && (
        <span className="mt-2 block text-[9px] leading-3.5 text-amber-100/80">
          Country filtering uses native model identities. Switch the network geography back to bidding zones first.
        </span>
      )}
    </div>
  );
}
