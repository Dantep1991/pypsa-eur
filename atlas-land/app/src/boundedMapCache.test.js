import { BoundedMapCache } from './boundedMapCache';

test('icon memory stays bounded across repeated zoom/style combinations', () => {
  const cache = new BoundedMapCache(128);
  for (let i = 0; i < 30000; i += 1) cache.set(i, { html: `icon-${i}` });
  expect(cache.size).toBe(128);
  expect(cache.get(0)).toBeUndefined();
  expect(cache.get(29999)).toEqual({ html: 'icon-29999' });
});

test('recently used styles survive eviction and replacement does not grow the cache', () => {
  const cache = new BoundedMapCache(2);
  cache.set('a', 1).set('b', 2);
  cache.get('a');
  cache.set('c', 3);
  expect(cache.has('b')).toBe(false);
  cache.set('a', 4);
  expect(cache.size).toBe(2);
  expect(cache.get('a')).toBe(4);
});
