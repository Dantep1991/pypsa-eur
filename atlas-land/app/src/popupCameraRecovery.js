// A popup auto-pan is temporary inspection space, not an explicit destination.
// Only the popup's Close button / Escape restores it. Automatic closures from
// data replacement, another popup or navigation must never move the camera.
export function installPopupCameraRecovery(map) {
  const container = map.getContainer?.();
  if (!container) return () => {};
  let origin = null;
  let popup = null;
  let expectingAutoPan = false;
  let closeToken = null;
  let closeTimer;
  const forget = () => {
    origin = null; expectingAutoPan = false; closeToken = null;
    clearTimeout(closeTimer);
  };
  const autoPan = () => {
    if (!origin) {
      const center = map.getCenter();
      origin = { center: [center.lat, center.lng], zoom: map.getZoom() };
    }
    // Leaflet fires autopanstart immediately before panBy's movestart.
    expectingAutoPan = true;
  };
  const moving = () => {
    if (expectingAutoPan) expectingAutoPan = false;
    else forget();
  };
  const opened = event => { popup = event.popup; };
  const closed = event => {
    if (event.popup !== popup) return;
    const restore = closeToken && origin;
    popup = null;
    forget(); // Claim before stop/setView emit synchronous movement events.
    if (restore) {
      map.stop();
      map.setView(restore.center, restore.zoom, { animate: false });
    }
  };
  const armClose = event => {
    if (!popup || !origin) return;
    const element = popup.getElement?.();
    const button = event.target?.closest?.('.leaflet-popup-close-button');
    const closeButton = event.type === 'click' && button && element?.contains(button);
    const escape = event.type === 'keydown' && event.key === 'Escape'
      && !event.altKey && !event.ctrlKey && !event.metaKey
      && popup.options?.closeOnEscapeKey !== false;
    if (!closeButton && !escape) return;
    const token = {};
    closeToken = token;
    // Native events can run microtasks between capture and bubble listeners.
    // Expire after the event task, not before Leaflet's closing listener runs.
    // A prevented/non-closing key must not arm a later automatic close.
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { if (closeToken === token) closeToken = null; }, 0);
  };
  map.on('autopanstart', autoPan);
  map.on('movestart', moving);
  map.on('dragstart zoomstart resize', forget);
  map.on('popupopen', opened);
  map.on('popupclose', closed);
  container.addEventListener('click', armClose, true);
  container.addEventListener('keydown', armClose, true);
  return () => {
    forget();
    popup = null;
    map.off('autopanstart', autoPan);
    map.off('movestart', moving);
    map.off('dragstart zoomstart resize', forget);
    map.off('popupopen', opened);
    map.off('popupclose', closed);
    container.removeEventListener('click', armClose, true);
    container.removeEventListener('keydown', armClose, true);
  };
}
