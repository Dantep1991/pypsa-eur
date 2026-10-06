import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { readSubsetView, saveSubsetView } from '../modelWorkspace/savedSubsetView';
import './ModelDistillationControls.css';

const formatCount = value => Number(value || 0).toLocaleString();

export default function ModelDistillationControls({
  context = {},
  availableCountries,
  selectedCountries,
  onSelectionChange,
  previewStatus,
  showContext,
  onShowContextChange,
  onPreview,
  onClear,
  countryName,
  automatic = false,
}) {
  const [saved, setSaved] = useState(null), [saveStatus, setSaveStatus] = useState('');
  const selected = selectedCountries || [];
  const remaining = useMemo(
    () => (availableCountries || []).filter(code => !selected.includes(code)),
    [availableCountries, selected],
  );
  const preview = previewStatus?.preview;
  const busy = previewStatus?.state === 'loading';
  const counts = preview?.counts?.by_status || {};

  useEffect(() => {
    setSaveStatus('');
    try { setSaved(readSubsetView(window.localStorage, context, availableCountries || [])); }
    catch (_) { setSaved(null); }
  }, [context.projectId, context.version, context.modelName, availableCountries]);
  const save = () => {
    try { setSaved(saveSubsetView(window.localStorage, preview, context, showContext)); setSaveStatus('View saved in this browser. Original model unchanged.'); }
    catch (error) { setSaveStatus(error.message); }
  };
  const restore = async () => {
    setSaveStatus('');
    onSelectionChange([...saved.countries]);
    const fresh = await onPreview([...saved.countries]);
    if (fresh) {
      onShowContextChange(saved.showContext);
      setSaveStatus(fresh.source.scene_fingerprint === saved.sourceFingerprint ? 'Saved view restored.' : 'Selection restored using the latest source data.');
    }
  };

  return (
    <div className="model-distillation-controls space-y-2.5">
      {!automatic && <p className="model-distillation-intro">Keep the selected countries on the map. Boundary links stay visible; the rest is hidden.</p>}
      {!automatic && <div>
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Retain countries</span>
        <div className="flex gap-1.5">
          <select value="" onChange={event => { if (event.target.value) onSelectionChange([...selected, event.target.value].sort()); }} disabled={busy || !remaining.length} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50" aria-label="Country to retain">
            <option value="">Add country…</option>
            {remaining.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
          </select>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.length ? selected.map(code => (
            <button key={code} type="button" onClick={() => onSelectionChange(selected.filter(item => item !== code))} disabled={busy} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.05] px-2 py-1 text-[9px] text-white disabled:opacity-50" title={`Remove ${countryName(code)}`}>
              {countryName(code)} <X className="h-2.5 w-2.5 text-tj-slate" />
            </button>
          )) : <span className="text-[9px] text-tj-slate">Choose one or more countries.</span>}
        </div>
      </div>}

      {automatic && busy && <p role="status">Loading country map preview…</p>}

      {previewStatus?.state === 'error' && <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[9px] leading-3.5 text-red-200">{previewStatus.error}</div>}

      {preview && (
        <>
          <dl className="model-distillation-counts">
            <div><dt>Inside selection</dt><dd>{formatCount(counts.retained)}</dd></div>
            <div><dt>Connections to outside</dt><dd>{formatCount(counts.boundary_crossing)}</dd></div>
            <div><dt>Outside selection</dt><dd>{formatCount(counts.excluded)}</dd></div>
            <div><dt>Country mapping unavailable</dt><dd>{formatCount(counts.unresolved)}</dd></div>
          </dl>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
            <input type="checkbox" checked={showContext} onChange={event => onShowContextChange(event.target.checked)} className="mt-0.5 accent-tj-gold" />
            <span><span className="block text-[10px] font-medium text-white">Show rest of model faintly</span></span>
          </label>
          {!automatic && <details><summary>What do these counts mean?</summary><p>Counts cover source nodes, connections and loaded assets, not just visible markers. Inside: all connected nodes are in your selection. Boundary: an object connects inside and outside. Outside: none of its nodes are selected. Unavailable: a country or node membership cannot be established; Atlas does not guess.</p></details>}
        </>
      )}

      {!automatic && <div className="flex gap-2">
        <button type="button" onClick={onPreview} disabled={busy || !selected.length} className="atlas-primary-action flex-1 rounded-lg border border-tj-gold/40 bg-tj-gold px-3 py-2 text-[10px] font-semibold text-tj-navy-dark disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Classifying…</span> : preview ? 'Refresh preview' : 'Preview subset'}
        </button>
        {preview && <button type="button" onClick={onClear} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-[10px] text-slate-200 hover:bg-white/5 disabled:opacity-40"><RotateCcw className="h-3 w-3" />Full model</button>}
      </div>}
      {!automatic && <div className="model-distillation-save">
        {preview && <button type="button" onClick={save} disabled={busy}>Save view</button>}
        {saved && <button type="button" onClick={restore} disabled={busy}>Restore saved view</button>}
      </div>}
      {saveStatus && <p role="status">{saveStatus}</p>}
      {!automatic && <small>Map preview only. Saving remembers this selection; it does not create a runnable model.</small>}
    </div>
  );
}
