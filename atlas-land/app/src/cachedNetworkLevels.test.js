import { uniqueCachedNetworkLevels } from './cachedNetworkLevels';

const full = (filename) => ({ filename, isFullNodal: true, sortOrder: Number.MAX_SAFE_INTEGER });
const levels = [
  full('base_ES.nc'),
  { filename: 'base_ES_nuts3.nc', geographicLevel: 'nuts3', sortOrder: 50 },
  full('base_ES_full.nc'),
];

test('full-network aliases occupy one stop and retain both selected filenames', () => {
  const result = uniqueCachedNetworkLevels(levels, 'base_ES_full.nc');
  expect(result).toHaveLength(2);
  expect(result[1]).toMatchObject({
    filename: 'base_ES_full.nc', filenames: ['base_ES.nc', 'base_ES_full.nc'],
  });
  for (const filename of ['base_ES.nc', 'base_ES_full.nc']) {
    expect(result.findIndex((level) => level.filenames.includes(filename))).toBe(1);
  }
  expect(levels[0].filenames).toBeUndefined();
});

test('alias ordering does not change the canonical full cache', () => {
  expect(uniqueCachedNetworkLevels([...levels].reverse(), 'base_ES_full.nc')[1].filename)
    .toBe('base_ES_full.nc');
});

test('legacy-only full cache remains available and repeated files do not add stops', () => {
  expect(uniqueCachedNetworkLevels([full('base_ES.nc'), full('base_ES.nc')]))
    .toEqual([{ ...full('base_ES.nc'), filenames: ['base_ES.nc'] }]);
});

test('distinct geographic and access-node resolutions stay available', () => {
  const distinct = [
    ...levels,
    { filename: 'base_ES_c005.nc', sortOrder: 105 },
    { filename: 'base_ES_nuts2.nc', geographicLevel: 'nuts2', sortOrder: 40 },
  ];
  expect(uniqueCachedNetworkLevels(distinct).map((level) => level.filename))
    .toEqual(['base_ES_nuts2.nc', 'base_ES_nuts3.nc', 'base_ES_c005.nc', 'base_ES.nc']);
});
