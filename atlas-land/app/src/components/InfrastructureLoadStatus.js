import React from 'react';
import { AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';

export default function InfrastructureLoadStatus({
  label, loading, checking, loaded, empty, error, onReload,
}) {
  const busy = loading || checking;
  const state = error ? 'error' : busy ? 'loading' : !loaded ? 'idle' : empty ? 'empty' : 'ready';
  const Icon = state === 'error' ? AlertCircle : busy ? RefreshCw : state === 'ready' ? CheckCircle2 : Info;
  const title = state === 'error' ? `${label} ${loaded ? 'update failed' : 'data unavailable'}`
    : checking ? `Checking ${label.toLowerCase()} data…`
      : loading ? `Loading ${label.toLowerCase()} data…`
        : state === 'idle' ? `${label} data not loaded`
          : state === 'empty' ? 'No records for this selection' : `${label} data ready`;
  const detail = state === 'error'
    ? loaded ? 'Previously loaded layers remain available. The requested update failed.' : 'The requested data could not be loaded.'
    : state === 'empty' ? 'The source returned no assets or links for the loaded layers and country selection. This does not establish that no infrastructure exists.'
      : checking ? 'Checking the local source before requesting map data.'
        : loading ? 'Country controls unlock when the download finishes.'
          : state === 'idle' ? 'Load the grid to begin. Other layers load only when selected.'
            : 'Loaded layers are available. Supply, demand and storage load only when selected.';

  return (
    <div className="p-3 border-b border-white/10">
      <div role="status" aria-label={`${label} data status`} aria-atomic="true"
        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${state === 'error'
          ? 'border-red-400/30 bg-red-500/10 text-red-200'
          : state === 'ready' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
            : 'border-slate-400/25 bg-slate-400/10 text-slate-200'}`}>
        <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold">{title}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-200">{detail}</p>
          {error && <p className="mt-2 break-words text-[11px] leading-4">{error}</p>}
        </div>
      </div>
      {(state === 'error' || state === 'idle') && (
        <div className="mt-2">
          <button type="button" onClick={onReload} disabled={busy}
            aria-label={`Reload ${label.toLowerCase()} grid`}
            className="rounded-lg border border-white/25 bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50">
            Reload grid
          </button>
          <p className="mt-1 text-[10px] leading-4 text-slate-300">Reload starts with Grid. Select other layers again as needed.</p>
        </div>
      )}
    </div>
  );
}
