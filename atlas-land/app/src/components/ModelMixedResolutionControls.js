import React, { useEffect, useMemo, useState } from 'react';
import { GitBranch, Loader2, RotateCcw } from 'lucide-react';
import ModelControlHelp from './ModelControlHelp';

const count = value => Number(value || 0).toLocaleString();

export default function ModelMixedResolutionControls({
  countries,
  nativeLabel,
  status,
  onApply,
  onClear,
  countryName,
}) {
  const availableCountries = useMemo(() => [...new Set(countries || [])].sort(), [countries]);
  const [focusCountry, setFocusCountry] = useState(availableCountries[0] || '');
  useEffect(() => {
    if (!availableCountries.includes(focusCountry)) setFocusCountry(availableCountries[0] || '');
  }, [availableCountries, focusCountry]);
  const preview = status?.preview;
  const busy = status?.state === 'loading';
  const rings = preview?.meta?.preview?.profile?.rings;
  const counts = preview?.meta?.preview?.counts;

  return (
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-black/20 p-3" aria-label="Mixed-resolution model view">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tj-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-white">Mixed-resolution view</p>
        </div>
        <ModelControlHelp label="Mixed-resolution view">
          <p>Keep the focus country and its connected neighbours at {nativeLabel || 'the model’s native topology'}, then aggregate more distant areas to country markers.</p>
          <p>No synthetic detail is introduced: country selection never loads another network. Atlas only groups nodes already present in this project version; splitting below native resolution remains unavailable.</p>
          <p>This is a visual aggregation only. It cannot be run or published as a derived model.</p>
        </ModelControlHelp>
      </div>

      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Focus country inside this model</span>
        <select
          value={focusCountry}
          onChange={event => setFocusCountry(event.target.value)}
          disabled={busy || availableCountries.length < 2}
          className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50"
          aria-label="Mixed-resolution focus country"
        >
          {availableCountries.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
        </select>
      </label>

      {status?.state === 'error' && (
        <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[9px] leading-3.5 text-red-200">{status.error}</div>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-3 gap-1 text-center text-[9px]">
            <div className="rounded-lg border border-tj-gold/30 bg-tj-gold/[0.08] p-1.5"><span className="block font-semibold text-tj-gold">{count(rings?.focus?.length)}</span><span className="text-tj-slate">Focus</span></div>
            <div className="rounded-lg border border-white/15 bg-white/[0.05] p-1.5"><span className="block font-semibold text-white">{count(rings?.adjacent?.length)}</span><span className="text-tj-slate">Neighbours</span></div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5"><span className="block font-semibold text-white">{count((rings?.outer?.length || 0) + (rings?.other?.length || 0))}</span><span className="text-tj-slate">Country level</span></div>
          </div>
          <p className="text-[9px] leading-3.5 text-tj-slate">
            {count(counts?.sourceNodes)} mapped source nodes → {count(counts?.projectedNodes)} visible nodes · {count(counts?.sourceLinks)} source links → {count(counts?.projectedLinks)} visible interfaces
          </p>
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApply(focusCountry)}
          disabled={busy || !focusCountry || availableCountries.length < 2}
          className="atlas-primary-action flex-1 rounded-lg border border-tj-gold/40 bg-tj-gold px-3 py-2 text-[10px] font-semibold text-tj-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Projecting…</span> : preview ? 'Update view' : 'Apply mixed view'}
        </button>
        {preview && (
          <button type="button" onClick={onClear} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-[10px] text-slate-200 hover:bg-white/5 disabled:opacity-40">
            <RotateCcw className="h-3 w-3" />Native model
          </button>
        )}
      </div>
    </div>
  );
}
