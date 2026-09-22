import React from 'react';
import { BarChart3, X } from 'lucide-react';

const formatValue = value => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: Math.abs(number) < 10 ? 2 : 1, notation: Math.abs(number) >= 100000 ? 'compact' : 'standard' }).format(number);
};

export default function ModelResultLegend({ scene, onClear }) {
  if (!scene) return null;
  const selection = scene.selection || {};
  const legend = scene.legend || {};
  const gradient = legend.scale === 'diverging'
    ? 'linear-gradient(90deg,#2563eb,#67e8f9,#e2e8f0,#fb923c,#dc2626)'
    : 'linear-gradient(90deg,#172554,#0369a1,#0d9488,#84cc16,#facc15)';
  return (
    <aside aria-label="Model result legend" className="pointer-events-auto absolute bottom-4 left-3 z-[560] w-[min(300px,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-[#071421]/95 p-3 text-[10px] text-slate-300 shadow-2xl backdrop-blur-xl sm:left-[340px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tj-gold" />
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-white">{selection.class_name} · {selection.property_name}</p>
            <p className="mt-0.5 truncate text-[9px] text-slate-400">{selection.period_label} · {scene.run?.label || scene.run?.run_id}</p>
          </div>
        </div>
        <button type="button" onClick={onClear} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Clear result layer"><X className="h-3 w-3" /></button>
      </div>
      <div className="mt-2 h-2 rounded-full" style={{ background: gradient }} />
      <div className="mt-1 flex items-center justify-between text-[9px] text-slate-300">
        <span>{formatValue(legend.minimum)} {legend.unit || ''}</span>
        <span>{formatValue(legend.maximum)} {legend.unit || ''}</span>
      </div>
      <p className="mt-2 text-[9px] leading-3.5 text-slate-400">{Number(scene.coverage?.mapped_row_count ?? scene.coverage?.projected_row_count ?? 0).toLocaleString()} mapped · {Number(scene.coverage?.excluded_row_count || 0).toLocaleString()} outside this topology · {scene.model_version}</p>
    </aside>
  );
}
