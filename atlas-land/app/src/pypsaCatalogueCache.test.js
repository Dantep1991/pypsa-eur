import {
  clearPypsaCatalogueCache,
  pypsaCatalogueCacheKey,
  readPypsaCatalogueCache,
  writePypsaCatalogueCache,
} from './pypsaCatalogueCache';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: jest.fn((key) => values.get(key) ?? null),
    setItem: jest.fn((key, value) => values.set(key, value)),
    removeItem: jest.fn((key) => values.delete(key)),
  };
};

test('stores a bounded catalogue by resolution/source and restores its supported metadata', () => {
  const storage = memoryStorage();
  expect(writePypsaCatalogueCache(storage, 'pypsa', 'auto', {
    source: 'local',
    capabilities: { parse_nc_omit_geojson_overlays: true, ignored: true },
    files: [{
      filename: 'base_FR_nuts3.nc',
      is_distill: false,
      geographic_country: 'FR',
      geographic_level: 'nuts3',
      unexpected: 'discard me',
    }],
  }, 1000)).toBe(true);

  expect(storage.setItem).toHaveBeenCalledWith(
    pypsaCatalogueCacheKey('pypsa', 'auto'),
    expect.any(String),
  );
  expect(readPypsaCatalogueCache(storage, 'pypsa', 'auto', { now: 2500 })).toEqual({
    files: [{
      filename: 'base_FR_nuts3.nc',
      is_distill: false,
      geographic_country: 'FR',
      geographic_level: 'nuts3',
    }],
    source: 'local',
    capabilities: { parse_nc_omit_geojson_overlays: true },
    savedAt: 1000,
    ageMs: 1500,
  });
});

test('rejects expired, malformed, empty and cross-resolution records without throwing', () => {
  const storage = memoryStorage();
  expect(writePypsaCatalogueCache(storage, 'pypsa', 'auto', { files: [] }, 1000)).toBe(false);
  storage.setItem(pypsaCatalogueCacheKey('pypsa', 'auto'), '{bad json');
  expect(readPypsaCatalogueCache(storage, 'pypsa', 'auto')).toBeNull();

  writePypsaCatalogueCache(storage, 'pypsa_512', 'local', {
    files: [{ filename: 'base_ES.nc', is_distill: false }],
  }, 1000);
  expect(readPypsaCatalogueCache(storage, 'pypsa_512', 'auto', { now: 1001 })).toBeNull();
  expect(readPypsaCatalogueCache(storage, 'pypsa_512', 'local', { now: 5000, maxAgeMs: 1000 })).toBeNull();
});

test('clears only the requested resolution and source record', () => {
  const storage = memoryStorage();
  writePypsaCatalogueCache(storage, 'pypsa', 'auto', { files: [{ filename: 'base_BE.nc' }] }, 1000);
  writePypsaCatalogueCache(storage, 'pypsa_512', 'auto', { files: [{ filename: 'base_FR.nc' }] }, 1000);
  expect(clearPypsaCatalogueCache(storage, 'pypsa', 'auto')).toBe(true);
  expect(readPypsaCatalogueCache(storage, 'pypsa', 'auto', { now: 1001 })).toBeNull();
  expect(readPypsaCatalogueCache(storage, 'pypsa_512', 'auto', { now: 1001 })).not.toBeNull();
});
