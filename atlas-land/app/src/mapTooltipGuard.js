import L from 'leaflet';

// Leaflet tooltips are independent layers (including those in custom panes).
// Keep one owner per map instead of relying on each source's mouseout order.
export function installMapTooltipGuard(map) {
  let active = null, activePopup = null;
  const opened = ({ tooltip }) => {
    // Permanent region names are map annotations, not inspection tooltips.
    // Selected-asset tooltips are still governed, even when permanent.
    if (!tooltip || tooltip.options.atlasMapLabel || tooltip === active) return;
    if (activePopup?.isOpen()) { map.closeTooltip(tooltip); return; }
    // A late line-canvas hover must not replace a data marker, including a
    // clicked/pinned input tooltip. Mouseout or explicit unpin releases it.
    if (active?.isOpen()
        && (active.options.atlasTooltipPriority || 0) > (tooltip.options.atlasTooltipPriority || 0)) {
      map.closeTooltip(tooltip);
      return;
    }
    const previous = active;
    // Closing a tooltip emits tooltipclose synchronously. Claim the new one
    // first so that the previous source cannot clear its replacement.
    active = tooltip;
    if (previous) map.closeTooltip(previous);
  };
  const closed = ({ tooltip }) => {
    if (tooltip === active) active = null;
  };
  const popupOpened = ({ popup }) => {
    activePopup = popup;
    if (active) map.closeTooltip(active);
  };
  const popupClosed = ({ popup }) => { if (popup === activePopup) activePopup = null; };
  map.on('tooltipopen', opened);
  map.on('tooltipclose', closed);
  map.on('popupopen', popupOpened);
  map.on('popupclose', popupClosed);
  // Also cover tooltips mounted before this effect (e.g. selected assets).
  map.eachLayer?.(layer => {
    if (layer instanceof L.Popup && layer.isOpen()) popupOpened({ popup: layer });
    if (layer instanceof L.Tooltip && layer.isOpen()) opened({ tooltip: layer });
  });
  return () => {
    map.off('tooltipopen', opened);
    map.off('tooltipclose', closed);
    map.off('popupopen', popupOpened);
    map.off('popupclose', popupClosed);
    if (active) map.closeTooltip(active);
    active = null;
    activePopup = null;
  };
}
