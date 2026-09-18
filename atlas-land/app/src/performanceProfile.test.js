import {
  MAP_PERFORMANCE_PREFERENCES,
  readMapPerformancePreference,
  resolveMapPerformanceMode,
} from './performanceProfile';

test.each([
  ['1', MAP_PERFORMANCE_PREFERENCES.PERFORMANCE],
  ['performance', MAP_PERFORMANCE_PREFERENCES.PERFORMANCE],
  ['0', MAP_PERFORMANCE_PREFERENCES.QUALITY],
  ['quality', MAP_PERFORMANCE_PREFERENCES.QUALITY],
  ['auto', MAP_PERFORMANCE_PREFERENCES.AUTO],
  [null, MAP_PERFORMANCE_PREFERENCES.AUTO],
])('reads legacy and current map-performance preference %p', (stored, expected) => {
  const storage = { getItem: () => stored };
  expect(readMapPerformancePreference(storage)).toBe(expected);
});

test('storage failure falls back to adaptive mode', () => {
  expect(readMapPerformancePreference({ getItem: () => { throw new Error('blocked'); } }))
    .toBe(MAP_PERFORMANCE_PREFERENCES.AUTO);
});

test.each([
  [{ navigatorLike: { deviceMemory: 4, hardwareConcurrency: 8 } }, 'this device'],
  [{ navigatorLike: { deviceMemory: 8, hardwareConcurrency: 4 } }, 'this device'],
  [{ navigatorLike: { connection: { saveData: true } } }, 'data saver'],
  [{ matchMedia: () => ({ matches: true }) }, 'reduced motion'],
  [{ connectionCount: 1800 }, 'dense map'],
  [{ facilityCount: 1800 }, 'dense map'],
])('adaptive mode protects constrained case %#', (input, reason) => {
  expect(resolveMapPerformanceMode(input)).toEqual({ enabled: true, automatic: true, reason });
});

test('adaptive mode retains full quality for an ordinary light map', () => {
  expect(resolveMapPerformanceMode({
    facilityCount: 500,
    connectionCount: 800,
    navigatorLike: { deviceMemory: 8, hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false }),
  })).toEqual({ enabled: false, automatic: true, reason: 'full visual quality' });
});

test('adaptive mode protects a supply map before HTML markers breach the DOM budget', () => {
  expect(resolveMapPerformanceMode({
    facilityCount: 1900,
    connectionCount: 1200,
    navigatorLike: { deviceMemory: 8, hardwareConcurrency: 8 },
    matchMedia: () => ({ matches: false }),
  })).toEqual({ enabled: true, automatic: true, reason: 'dense map' });
});

test('manual choices override both device and map density', () => {
  const constrained = { deviceMemory: 2, hardwareConcurrency: 2, connection: { saveData: true } };
  expect(resolveMapPerformanceMode({
    preference: MAP_PERFORMANCE_PREFERENCES.QUALITY,
    facilityCount: 9999,
    connectionCount: 9999,
    navigatorLike: constrained,
  })).toEqual({ enabled: false, automatic: false, reason: 'manual preference' });
  expect(resolveMapPerformanceMode({
    preference: MAP_PERFORMANCE_PREFERENCES.PERFORMANCE,
  })).toEqual({ enabled: true, automatic: false, reason: 'manual preference' });
});
