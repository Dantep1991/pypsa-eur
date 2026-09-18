// Read when issuing a movement so an OS accessibility preference change is
// respected without remounting the map (which would lose the user's viewport).
export function animateAtlasMap() {
  return typeof window === 'undefined'
    || typeof window.matchMedia !== 'function'
    || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
