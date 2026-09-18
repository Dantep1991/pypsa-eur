import React from 'react';

const LABELS = {
  pressure: ['Lower pressure', 'Higher pressure'],
  available_mw: ['Less access (MW)', 'More access (MW)'],
  queued_mw: ['Less queued (MW)', 'More queued (MW)'],
  project_count: ['Fewer projects', 'More projects'],
  lead_time_years: ['Shorter lead time', 'Longer lead time'],
};

export default function GridAccessLegend({ metric }) {
  const labels = LABELS[metric] || LABELS.pressure;
  // Match atlas_grid_access._colour's three discrete bands and direction.
  const colors = metric === 'available_mw'
    ? ['#ef4444', '#f59e0b', '#22c55e'] : ['#22c55e', '#f59e0b', '#ef4444'];
  return <div className="mt-3" role="group" aria-label="Grid access map legend">
    <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
      {colors.map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
    </div>
    <div className="mt-1 flex justify-between gap-2 text-[9px] text-slate-300">
      <span>{labels[0]}</span><span>{labels[1]}</span>
    </div>
    <p className="mt-1 text-[9px] leading-3 text-slate-400">Unreported values use the connection-side colour.</p>
  </div>;
}
