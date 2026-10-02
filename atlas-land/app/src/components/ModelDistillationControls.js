import React, { useMemo, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, X } from 'lucide-react';

const formatCount = value => Number(value || 0).toLocaleString();

export default function ModelDistillationControls({
  availableCountries,
  selectedCountries,
  onSelectionChange,
  previewStatus,
  showContext,
  onShowContextChange,
  onPreview,
  onClear,
  countryName,
}) {
  const [pendingCountry, setPendingCountry] = useState('');
  const selected = selectedCountries || [];
  const remaining = useMemo(
    () => (availableCountries || []).filter(code => !selected.includes(code)),
    [availableCountries, selected],
  );
  const preview = previewStatus?.preview;
  const busy = previewStatus?.state === 'loading';
  const counts = preview?.counts?.by_status || {};

  const addCountry = () => {
    if (!pendingCountry || selected.includes(pendingCountry)) return;
    onSelectionChange([...selected, pendingCountry].sort());
    setPendingCountry('');
  };

  return (
    <div className="space-y-2.5">
      <div>
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Retain countries</span>
        <div className="flex gap-1.5">
          <select value={pendingCountry} onChange={event => setPendingCountry(event.target.value)} disabled={busy || !remaining.length} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50" aria-label="Country to retain">
            <option value="">Add country…</option>
            {remaining.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
          </select>
          <button type="button" onClick={addCountry} disabled={busy || !pendingCountry} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-tj-gold/35 bg-tj-gold/10 text-tj-gold disabled:opacity-40" aria-label="Add retained country"><Plus className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.length ? selected.map(code => (
            <button key={code} type="button" onClick={() => onSelectionChange(selected.filter(item => item !== code))} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-1 text-[9px] text-white disabled:opacity-50" title={`Remove ${countryName(code)}`}>
              {countryName(code)} <X className="h-2.5 w-2.5 text-tj-slate" />
            </button>
          )) : <span className="text-[9px] text-tj-slate">Choose one or more countries.</span>}
        </div>
      </div>

      {previewStatus?.state === 'error' && <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[9px] leading-3.5 text-red-200">{previewStatus.error}</div>}

      {preview && (
        <>
          <div className="grid grid-cols-4 gap-1 text-center text-[9px]">
            <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] p-1.5"><span className="block font-semibold text-emerald-200">{formatCount(counts.retained)}</span><span className="text-tj-slate">Retained</span></div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-1.5"><span className="block font-semibold text-amber-200">{formatCount(counts.boundary_crossing)}</span><span className="text-tj-slate">Boundary</span></div>
            <div className="rounded-lg border border-slate-400/20 bg-slate-400/[0.05] p-1.5"><span className="block font-semibold text-slate-200">{formatCount(counts.excluded)}</span><span className="text-tj-slate">Excluded</span></div>
            <div className="rounded-lg border border-violet-300/20 bg-violet-300/[0.05] p-1.5"><span className="block font-semibold text-violet-200">{formatCount(counts.unresolved)}</span><span className="text-tj-slate">Unresolved</span></div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
            <input type="checkbox" checked={showContext} onChange={event => onShowContextChange(event.target.checked)} className="mt-0.5 accent-tj-gold" />
            <span><span className="block text-[10px] font-medium text-white">Ghost excluded context</span><span className="block text-[9px] leading-3.5 text-tj-slate">Compare the filtered subset with excluded and unresolved source objects.</span></span>
          </label>
          <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[9px] leading-3.5 text-tj-slate">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
            <span>{formatCount(preview.counts?.reconciliation?.classified_total)} identities reconciled · {preview.model_version} · preview only</span>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onPreview} disabled={busy || !selected.length} className="atlas-primary-action flex-1 rounded-lg border border-tj-gold/40 bg-tj-gold px-3 py-2 text-[10px] font-semibold text-tj-navy-dark disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Classifying…</span> : preview ? 'Refresh preview' : 'Preview subset'}
        </button>
        {preview && <button type="button" onClick={onClear} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-[10px] text-slate-200 hover:bg-white/5 disabled:opacity-40"><RotateCcw className="h-3 w-3" />Full model</button>}
      </div>
    </div>
  );
}
