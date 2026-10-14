import { landCountryScope } from './landCountryScope';

const status = { ready: true, countries: [{ code: 'BE' }, { code: 'FR' }] };
test('known, mixed and empty scopes remain distinct', () => {
  expect(landCountryScope(['BE', 'FR'], status)).toMatchObject({ ready: true, countries: ['BE', 'FR'], partial: false });
  expect(landCountryScope([], status)).toMatchObject({ ready: true, countries: [], partial: false });
  expect(landCountryScope(['BE', 'XK'], status)).toMatchObject({ ready: true, countries: ['BE'], missing: ['XK'], partial: true });
  expect(landCountryScope(['XK'], status)).toMatchObject({ ready: false, countries: [], missing: ['XK'], partial: false });
});

test('coverage normalization keeps the requested countries distinct from the supported intersection', () => {
  const scope = landCountryScope([' be ', 'BE', 'xk', '', 'fr', 'XK'], status);
  expect(scope).toMatchObject({ ready: true, countries: ['BE', 'FR'], missing: ['XK'], partial: true });
  expect(scope.message).toContain('2 of 3 selected countries');
  expect(scope.message).toContain('excluded from land results');
});
test('missing or unavailable service coverage cannot authorize a global fallback', () => {
  for (const value of [null, { ready: true }, { ready: false, countries: [] }]) {
    expect(landCountryScope(['BE'], value).ready).toBe(false);
  }
});
