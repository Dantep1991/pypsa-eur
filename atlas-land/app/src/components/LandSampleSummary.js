import React from 'react';

export default function LandSampleSummary({ stats, countryScoped = false }) {
  if (!stats) return null;
  if (stats.error) return <p role="status" className="mt-2 text-amber-200">{stats.error}</p>;
  if (stats.sample_count === 0) {
    return <p role="status" className="mt-3 rounded-lg border border-amber-200/25 bg-black/20 p-2 text-slate-200">
      {stats.no_data_reason === 'outside_selected_countries'
        ? 'No selected-country area in this map sample. Frame the selected countries to inspect land.'
        : 'No local land-cover data in this map sample. Missing data does not mean land is available or unrestricted.'}
    </p>;
  }
  const roles = stats.roles_percent;
  if (!Number.isInteger(stats.sample_count) || stats.sample_count < 0 || !roles
    || !['hard_constraint', 'conditional_constraint', 'opportunity'].every(
      key => Number.isFinite(roles[key]) && roles[key] >= 0 && roles[key] <= 100,
    )) {
    return <p role="status" className="mt-2 text-amber-200">Visible-area sample unavailable. Please retry.</p>;
  }
  const coverage = stats.coverage_sample_percent;
  return <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
    <p className="text-[9px] uppercase tracking-wide text-slate-300">Visible-area sample</p>
    <div className="mt-1 grid grid-cols-3 gap-1 text-center tabular-nums">
      <div><p className="text-rose-300">{roles.hard_constraint}%</p><p className="text-[8px] text-slate-300">hard</p></div>
      <div><p className="text-amber-300">{roles.conditional_constraint}%</p><p className="text-[8px] text-slate-300">check</p></div>
      <div><p className="text-cyan-300">{roles.opportunity}%</p><p className="text-[8px] text-slate-300">opportunity</p></div>
    </div>
    <p className="mt-1 text-[9px] leading-3 text-slate-300">Percentages of sampled land with known cover—not all visible land. Approximate 96×96 {countryScoped ? 'country-clipped ' : ''}screen sample; classes can overlap.</p>
    {Number.isFinite(coverage) && coverage < 100 && <p role="status" className="mt-2 text-[9px] leading-3 text-amber-200">
      Known land cover at {coverage}% of in-scope sample points. The remainder is unknown, not unrestricted.
    </p>}
  </div>;
}
