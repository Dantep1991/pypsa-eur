// The Model portal and Nohm assistant live beside the Atlas iframe, not inside it.
// Fullscreen the same-origin host so those workspaces remain visible and usable.
export function atlasPresentationDocument(scope = window) {
  if (scope.parent === scope) return scope.document;
  try { return scope.parent.document || null; }
  catch (_) { return null; }
}

export async function setAtlasFullscreen(enabled, scope = window) {
  const host = atlasPresentationDocument(scope);
  if (!host) {
    if (enabled) throw new Error('The embedded host must own fullscreen.');
    return;
  }
  if (!enabled) {
    if (host.fullscreenElement) await host.exitFullscreen?.();
    return;
  }
  if (!host.documentElement?.requestFullscreen) throw new Error('Fullscreen is unavailable.');
  await host.documentElement.requestFullscreen();
}
