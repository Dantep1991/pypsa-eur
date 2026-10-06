import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import './ModelDistillationLegend.css';
import { distillationStatusColor } from '../modelWorkspace/distillationPreview';

const statusRows = [
  ['retained', 'Inside selection', distillationStatusColor('retained'), 'solid'],
  ['boundary_crossing', 'To outside', distillationStatusColor('boundary_crossing'), 'dashed'],
  ['excluded', 'Outside selection', distillationStatusColor('excluded'), 'solid'],
  ['unresolved', 'Unmapped country', distillationStatusColor('unresolved'), 'dashed'],
];

export default function ModelDistillationLegend({ preview, showContext, onClear }) {
  if (!preview) return null;
  const counts = preview.counts?.by_status || {};
  return (
    <aside aria-label="Distillation preview legend" className="model-distillation-legend">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2"><Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><p className="font-semibold">Country subset</p><p>{(preview.selection?.country_codes || []).join(' + ')} · map preview</p></div></div>
        <button type="button" onClick={onClear} className="inline-flex h-6 items-center gap-1 rounded-md border border-white/10 px-1.5 text-[9px] text-slate-300 hover:bg-white/5"><RotateCcw className="h-3 w-3" />Full</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {statusRows.filter(([key]) => showContext || !['excluded', 'unresolved'].includes(key)).map(([key, label, color, borderStyle]) => (
          <div key={key} className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2" style={{ borderColor: color, borderStyle }} />{label}</span><strong className="text-white">{Number(counts[key] || 0).toLocaleString()}</strong></div>
        ))}
      </div>
      <p className="mt-2">Original model unchanged.</p>
    </aside>
  );
}
