import React from 'react';

export default function RegionalBoundaryNotice({ incomplete = [] }) {
  if (!incomplete.length) return null;
  const missing = [...new Set(incomplete.flatMap(region => region.missingCountries))].sort();
  const details = incomplete.map(region => `${region.name}: ${region.shownCountries.length}/${region.total} country outlines; missing ${region.missingCountries.join(', ')}`).join('; ');
  return <span role="status" aria-label="Regional boundary coverage" title={details} className="font-normal">
    {' · Outline missing: '}{missing.join(', ')}
  </span>;
}
