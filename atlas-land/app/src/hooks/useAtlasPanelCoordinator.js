import { useCallback } from 'react';

const PANELS = ['assistant', 'carriers', 'land', 'access', 'domains'];
const withPanelOpen = (previous, panelOpen) => (
  previous.panelOpen === panelOpen ? previous : { ...previous, panelOpen }
);

// Expanded controls share the right side of the map. Panel focus must never
// toggle a data layer, change its filters or stop the independently owned mic.
export function useAtlasPanelCoordinator({ setAssistant, setCarriers, setLand, setAccess, compact = false, setDomainsCollapsed }) {
  return useCallback((panel) => {
    if (panel !== null && !PANELS.includes(panel)) throw new Error('Unknown Atlas control panel');
    if (panel === 'domains') {
      setDomainsCollapsed?.(false);
      if (!compact) return;
    } else if (panel && compact) {
      setDomainsCollapsed?.(true);
    }
    setAssistant(panel === 'assistant');
    setCarriers(panel === 'carriers');
    setLand((previous) => withPanelOpen(previous, panel === 'land'));
    setAccess((previous) => withPanelOpen(previous, panel === 'access'));
  }, [setAssistant, setCarriers, setLand, setAccess, compact, setDomainsCollapsed]);
}
