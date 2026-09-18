import { resolveAtlasApiBase } from './api';

test('hosted Atlas uses the host origin, including HTTPS and local production', () => {
  expect(resolveAtlasApiBase({ hostname: 'nohm.example', protocol: 'https:' })).toBe('');
  expect(resolveAtlasApiBase({ hostname: 'localhost', port: '5001' })).toBe('');
  expect(resolveAtlasApiBase({ hostname: 'localhost', protocol: 'https:', port: '3000' })).toBe('');
  expect(resolveAtlasApiBase({ hostname: '127.0.0.1', port: '5176' })).toBe('/atlas-api');
  expect(resolveAtlasApiBase({ hostname: '127.0.0.1', port: '5177' })).toBe('/atlas-api');
});

test('local development and integration prefixes are explicit', () => {
  expect(resolveAtlasApiBase({ hostname: 'localhost', port: '3000' })).toBe('http://127.0.0.1:5001');
  expect(resolveAtlasApiBase({ override: '/api/nohm/atlas/' })).toBe('/api/nohm/atlas');
  expect(resolveAtlasApiBase({ override: '', hostname: 'localhost', port: '3000' })).toBe('');
});
