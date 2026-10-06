import { readScenarioMapPalette } from './useScenarioMapPalette';

test('canvas colours resolve from theme tokens rather than unresolved var() strings', () => {
  document.documentElement.style.setProperty('--accent-primary-ui', 'rgb(28, 114, 147)');
  document.documentElement.style.setProperty('--accent-error', 'rgb(214, 69, 90)');
  document.documentElement.style.setProperty('--text-muted', 'rgb(71, 85, 105)');
  const palette = readScenarioMapPalette();
  expect(palette.changed).toBe('rgb(28, 114, 147)');
  expect(palette.disabled).toBe('rgb(214, 69, 90)');
  expect(palette.unresolved).toBe('rgb(71, 85, 105)');
  for (const token of ['--accent-primary-ui', '--accent-error', '--text-muted']) document.documentElement.style.removeProperty(token);
});
