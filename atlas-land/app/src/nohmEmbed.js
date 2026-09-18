export const NOHM_ATLAS_READY_MESSAGE = 'nohm.atlas.ready.v1';
export const NOHM_ATLAS_PING_MESSAGE = 'nohm.atlas.ping.v1';
export const NOHM_ATLAS_DOMAIN_MESSAGE = 'nohm.atlas.domain.v1';
export const NOHM_ATLAS_DOMAIN_EVENT = 'nohm:atlas-domain';
export const NOHM_ATLAS_DOMAINS = Object.freeze(['model', 'operate', 'visualise', 'explore']);

export function announceNohmEmbedReady(targetWindow = window) {
  if (!targetWindow?.parent || targetWindow.parent === targetWindow) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_READY_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
  }, targetWindow.location.origin);
  return true;
}

export function scheduleNohmEmbedReady(targetWindow = window) {
  if (!targetWindow?.requestAnimationFrame) return announceNohmEmbedReady(targetWindow);
  targetWindow.requestAnimationFrame(() => {
    targetWindow.requestAnimationFrame(() => announceNohmEmbedReady(targetWindow));
  });
  return true;
}

export function startNohmEmbedBridge(targetWindow = window, { onDomainChange } = {}) {
  if (!targetWindow?.parent || targetWindow.parent === targetWindow) return () => {};
  targetWindow.document?.documentElement?.setAttribute('data-nohm-atlas-ready', '1');
  const handleMessage = (event) => {
    const fromNohmShell = (
      event.source === targetWindow.parent
      && event.origin === targetWindow.location.origin
      && event.data?.protocolVersion === 1
      && event.data?.source === 'nohm-shell'
    );
    if (!fromNohmShell) return;
    if (event.data?.type === NOHM_ATLAS_PING_MESSAGE) {
      announceNohmEmbedReady(targetWindow);
      return;
    }
    const domain = String(event.data?.domain || '').toLowerCase();
    if (event.data?.type === NOHM_ATLAS_DOMAIN_MESSAGE && NOHM_ATLAS_DOMAINS.includes(domain)) {
      if (typeof onDomainChange === 'function') {
        onDomainChange(domain);
      } else if (typeof targetWindow.CustomEvent === 'function') {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_DOMAIN_EVENT, {
          detail: { domain },
        }));
      }
    }
  };
  targetWindow.addEventListener('message', handleMessage);
  scheduleNohmEmbedReady(targetWindow);
  return () => targetWindow.removeEventListener('message', handleMessage);
}
