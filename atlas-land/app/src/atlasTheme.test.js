import { applyAtlasTheme, ATLAS_THEMES, nextAtlasTheme, normalizeAtlasTheme } from './atlasTheme';

test('Atlas supports the same effective themes as the Nohm shell', () => {
  expect(ATLAS_THEMES).toEqual(['dark', 'light', 'horizon', 'meridian']);
  expect(normalizeAtlasTheme('HORIZON')).toBe('horizon');
  expect(normalizeAtlasTheme('system')).toBe('dark');
});

test('applying Horizon uses the Nohm light variant contract', () => {
  const root = { dataset: {}, style: {} };
  expect(applyAtlasTheme('horizon', root)).toBe('horizon');
  expect(root.dataset).toEqual({ theme: 'light', themeVariant: 'horizon', atlasTheme: 'horizon' });
  expect(root.style.colorScheme).toBe('light');
  applyAtlasTheme('meridian', root);
  expect(root.dataset).toEqual({ theme: 'light', themeVariant: 'meridian', atlasTheme: 'meridian' });
  applyAtlasTheme('dark', root);
  expect(root.dataset).toEqual({ theme: 'dark', atlasTheme: 'dark' });
  expect(root.style.colorScheme).toBe('dark');
});

test('the standalone theme control cycles through every Nohm theme', () => {
  expect(nextAtlasTheme('dark')).toBe('light');
  expect(nextAtlasTheme('light')).toBe('horizon');
  expect(nextAtlasTheme('horizon')).toBe('meridian');
  expect(nextAtlasTheme('meridian')).toBe('dark');
});
