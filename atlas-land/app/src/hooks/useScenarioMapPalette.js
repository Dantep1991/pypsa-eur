import { useEffect, useState } from 'react';

export function readScenarioMapPalette(root = document.documentElement) {
  const style = getComputedStyle(root);
  return { changed: style.getPropertyValue('--accent-primary-ui').trim(),
    disabled: style.getPropertyValue('--accent-error').trim(),
    unresolved: style.getPropertyValue('--text-muted').trim() };
}

// Canvas paint APIs do not resolve CSS var(). Read theme tokens into actual
// colours and invalidate geometry styles when the embedded theme changes.
export default function useScenarioMapPalette() {
  const [palette, setPalette] = useState(readScenarioMapPalette);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setPalette(readScenarioMapPalette(root)));
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-nohm-theme'] });
    return () => observer.disconnect();
  }, []);
  return palette;
}
