import React from 'react';

export default function ModelNetworkCoverage({ mappedLocations, mappedConnections }) {
  const count = value => Number.isInteger(value) && value >= 0 ? value.toLocaleString() : '—';
  return <>
    <span className="text-tj-slate" title="Unique locations with coordinates in the selected map dataset, including co-located assets.">Mapped locations <strong className="ml-1 text-white font-semibold">{count(mappedLocations)}</strong></span>
    <span className="text-tj-slate" title="Connections with valid route geometry or mapped endpoints in the selected map dataset. Not limited to the current viewport.">Mapped connections <strong className="ml-1 text-white font-semibold">{count(mappedConnections)}</strong></span>
  </>;
}
