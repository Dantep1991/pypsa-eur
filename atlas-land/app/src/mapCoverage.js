import { coordinate } from './atlasPresentation';

// Coverage of the selected map dataset, not whole-model totals or the current
// viewport. Connections have already passed the renderer's geometry resolver.
export function mappedNetworkCoverage(facilities, drawableConnections) {
  const locations = new Set();
  for (const facility of facilities) {
    if (facility.atlas_distillation_hidden) continue;
    const point = coordinate(facility);
    if (point) locations.add(point.join(','));
  }
  return {
    mappedLocations: locations.size,
    mappedConnections: drawableConnections.filter(connection => !connection.atlas_distillation_hidden).length,
  };
}
