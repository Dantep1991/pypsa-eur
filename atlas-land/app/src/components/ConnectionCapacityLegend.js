import React from 'react';
import { capacityColor, formatCapacity } from '../connectionCapacity';

export default function ConnectionCapacityLegend({ scales }) {
  if (!scales?.length) return null;
  return (
    <section aria-label="Connection capacity legend" className="pointer-events-none absolute bottom-20 right-3 sm:right-4 z-[560] w-[210px] rounded-xl border border-white/12 bg-[#071421]/94 px-3 py-2.5 text-[10px] text-slate-300 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold tracking-wide text-white">CAPACITY</span>
        <span className="text-[9px] text-slate-400">colour + width</span>
      </div>
      {scales.map(scale => (
        <div key={scale.units} role="group" aria-label={`${scale.units} capacity scale`} className="mt-2">
          <div className="flex justify-between text-[9px] text-slate-300">
            <span>{scale.units}</span>
            <span>{scale.count.toLocaleString()} rated links</span>
          </div>
          <div className="mt-1 h-2 rounded-full" aria-hidden="true" style={{
            background: scale.uniform ? capacityColor(0.5)
              : `linear-gradient(90deg, ${capacityColor(0)}, ${capacityColor(0.5)}, ${capacityColor(1)})`,
            ...(scale.uniform ? {} : { clipPath: 'polygon(0 36%, 100% 0, 100% 100%, 0 64%)' }),
          }} />
          {scale.uniform
            ? <p className="mt-1 text-[9px] text-slate-300">All rated links: {formatCapacity(scale.low)} {scale.units}</p>
            : <>
              <div className="mt-1 flex justify-between tabular-nums text-[9px] text-slate-300">
                {[scale.low, scale.mid, scale.high].map((value, index) => <span key={index}>{formatCapacity(value)}</span>)}
              </div>
              <p className="mt-0.5 text-right text-[9px] text-slate-400">Log scale · {scale.rangeLabel}</p>
            </>}
        </div>
      ))}
      {scales.length > 1 && <p className="mt-2 text-[9px] text-slate-400">Each unit has its own scale.</p>}
    </section>
  );
}
