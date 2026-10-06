import { mappedNetworkCoverage } from './mapCoverage';
import { connectionGeometry } from './atlasMapGeometry';

test('coverage counts unique valid locations, excluding hidden and unlocated records', () => {
  const facilities = [
    { latitude: 50, longitude: 4 }, { latitude: '50', longitude: '4' },
    { latitude: 0, longitude: 0 }, { latitude: null, longitude: '' },
    { latitude: true, longitude: 4 }, { latitude: 91, longitude: 4 },
    { latitude: 51, longitude: 5, atlas_distillation_hidden: true },
  ];
  expect(mappedNetworkCoverage(facilities, [])).toEqual({ mappedLocations: 2, mappedConnections: 0 });
});

test('coverage includes source-routed connections without endpoint markers, but not invalid or hidden routes', () => {
  const connections = [
    { coordinates: [[4, 50], [5, 51]] },
    { from: 'missing', to: 'also-missing' },
    { coordinates: [[4, 50], [5, 51]], atlas_distillation_hidden: true },
  ];
  const drawable = connections.filter(connection => connectionGeometry(connection, () => null));
  expect(mappedNetworkCoverage([], drawable)).toEqual({ mappedLocations: 0, mappedConnections: 1 });
});
