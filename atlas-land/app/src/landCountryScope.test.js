import { landCountryScope } from './landCountryScope';

const status = { ready: true, countries: [{ code: 'BE' }, { code: 'FR' }] };
test('known, mixed and empty scopes remain distinct', () => {
  expect(landCountryScope(['BE', 'FR'], status).ready).toBe(true);
  expect(landCountryScope([], status).ready).toBe(true);
  expect(landCountryScope(['BE', 'XK'], status)).toMatchObject({ ready: false, missing: ['XK'] });
  expect(landCountryScope(['XK'], status).ready).toBe(false);
});
test('missing or unavailable service coverage cannot authorize a global fallback', () => {
  for (const value of [null, { ready: true }, { ready: false, countries: [] }]) {
    expect(landCountryScope(['BE'], value).ready).toBe(false);
  }
});
