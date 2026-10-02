export const ATLAS_THEMES = Object.freeze(['dark', 'light', 'horizon', 'meridian']);

export function normalizeAtlasTheme(theme, fallback = 'dark') {
  const candidate = String(theme || '').toLowerCase();
  return ATLAS_THEMES.includes(candidate) ? candidate : fallback;
}

export function applyAtlasTheme(theme, root = document.documentElement) {
  const normalized = normalizeAtlasTheme(theme);
  root.dataset.theme = normalized === 'dark' ? 'dark' : 'light';
  if (normalized === 'horizon' || normalized === 'meridian') root.dataset.themeVariant = normalized;
  else delete root.dataset.themeVariant;
  root.dataset.atlasTheme = normalized;
  root.style.colorScheme = normalized === 'dark' ? 'dark' : 'light';
  return normalized;
}

export function nextAtlasTheme(theme) {
  const index = ATLAS_THEMES.indexOf(normalizeAtlasTheme(theme));
  return ATLAS_THEMES[(index + 1) % ATLAS_THEMES.length];
}
