import { useEffect, useState } from 'react';

export const COMPACT_ATLAS_QUERY = '(max-width: 1023px)';

// Only respond to a breakpoint crossing, not every pixel of a window resize.
// Domain controls never reopen automatically over the user's map or voice UI.
export function useAtlasWorkspaceLayout() {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(COMPACT_ATLAS_QUERY).matches)
  ));
  const [domainsCollapsed, setDomainsCollapsed] = useState(compact);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia(COMPACT_ATLAS_QUERY);
    const update = () => {
      setCompact(query.matches);
      if (query.matches) setDomainsCollapsed(true);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return { compact, domainsCollapsed, setDomainsCollapsed };
}
