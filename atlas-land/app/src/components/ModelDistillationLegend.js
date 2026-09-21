import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';

const statusRows = [
  ['retained', 'Retained', '#2dd4bf', 'solid'],
  ['boundary_crossing', 'Cut boundary', '#f59e0b', 'dashed'],
  ['excluded', 'Excluded context', '#64748b', 'solid'],
  ['unresolved', 'Unresolved', '#a78bfa', 'dashed'],
];

export default function ModelDistillationLegend({ preview, showContext, onClear }) {
  if (!preview) return null;
  const counts = preview.counts?.by_status || {};
  return (
    <aside aria-label="Distillation preview legend" className="pointer-events-auto absolute bottom-4 left-3 z-[560] w-[min(300px,calc(100vw-1.5rem))] rounded-xl border border-amber-300/20 bg-[#071421]/95 p-3 text-[10px] text-slate-300 shadow-2xl backdrop-blur-xl sm:left-[340px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2"><Filter className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" /><div><p className="text-[11px] font-semibold text-white">Distillation preview</p><p className="mt-0.5 text-[9px] text-slate-400">{(preview.selection?.country_codes || []).join(' + ')} · non-executable</p></div></div>
        <button type="button" onClick={onClear} className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 px-1.5 text-[9px] text-slate-300 hover:bg-white/5"><RotateCcw className="h-3 w-3" />Full</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {statusRows.filter(([key]) => showContext || !['excluded', 'unresolved'].includes(key)).map(([key, label, color, borderStyle]) => (
          <div key={key} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2" style={{ borderColor: color, borderStyle }} />{label}</span><strong className="text-white">{Number(counts[key] || 0).toLocaleString()}</strong></div>
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-3.5 text-tj-slate">Source {preview.model_version} is unchanged. Suturing and datafile creation have not run.</p>
    </aside>
  );
}
