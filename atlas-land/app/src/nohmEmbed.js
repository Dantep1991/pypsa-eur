export const NOHM_ATLAS_READY_MESSAGE = 'nohm.atlas.ready.v1';
export const NOHM_ATLAS_PING_MESSAGE = 'nohm.atlas.ping.v1';
export const NOHM_ATLAS_DOMAIN_MESSAGE = 'nohm.atlas.domain.v1';
export const NOHM_ATLAS_DOMAIN_EVENT = 'nohm:atlas-domain';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE = 'nohm.atlas.workspace-context.v1';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE = 'nohm.atlas.workspace-context.ack.v1';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT = 'nohm:atlas-workspace-context';
export const NOHM_ATLAS_MODEL_SCENE_MESSAGE = 'nohm.atlas.model-scene.v1';
export const NOHM_ATLAS_THEME_MESSAGE = 'nohm.atlas.theme.v1';
export const NOHM_ATLAS_THEME_EVENT = 'nohm:atlas-theme';
export const NOHM_ATLAS_DOMAINS = Object.freeze(['model', 'operate', 'visualise', 'explore']);
export const NOHM_ATLAS_THEMES = Object.freeze(['dark', 'light', 'horizon']);

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function normalizeNohmAtlasWorkspaceContext(context) {
  if (!context || typeof context !== 'object') return null;
  const projectId = optionalText(context.projectId);
  const mode = context.mode === 'model' && projectId ? 'model' : 'reference';
  const geography = context.nativeGeography && typeof context.nativeGeography === 'object'
    ? {
      id: optionalText(context.nativeGeography.id) || 'model-native',
      label: optionalText(context.nativeGeography.label) || 'Model-native geography',
      resolved: Boolean(context.nativeGeography.resolved),
    }
    : { id: 'model-native', label: 'Model-native geography', resolved: false };
  return {
    mode,
    projectId,
    projectName: optionalText(context.projectName) || projectId || 'Reference Atlas',
    modelId: optionalText(context.modelId),
    version: optionalText(context.version),
    scenario: optionalText(context.scenario),
    nativeGeography: geography,
  };
}

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

export function announceNohmModelScene(scene, targetWindow = window) {
  if (!targetWindow?.parent || targetWindow.parent === targetWindow) return false;
  const projectId = optionalText(scene?.projectId);
  const version = optionalText(scene?.version);
  const selectedYear = Number(scene?.selectedYear);
  const nodeCount = Number(scene?.nodeCount);
  const linkCount = Number(scene?.linkCount);
  if (!projectId || !version || !Number.isInteger(selectedYear)
      || !Number.isInteger(nodeCount) || nodeCount < 0
      || !Number.isInteger(linkCount) || linkCount < 0) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_MODEL_SCENE_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    projectId,
    version,
    selectedYear,
    nodeCount,
    linkCount,
  }, targetWindow.location.origin);
  return true;
}

export function startNohmEmbedBridge(targetWindow = window, { onDomainChange, onThemeChange, onWorkspaceContextChange } = {}) {
  if (!targetWindow?.parent || targetWindow.parent === targetWindow) return () => {};
  targetWindow.document?.documentElement?.setAttribute('data-nohm-atlas-ready', '1');
  let latestWorkspaceRevision = 0;
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
      return;
    }
    if (event.data?.type === NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE) {
      const requestId = optionalText(event.data?.requestId);
      const revision = Number(event.data?.revision);
      const context = normalizeNohmAtlasWorkspaceContext(event.data?.context);
      const accepted = Boolean(
        requestId
        && context
        && Number.isSafeInteger(revision)
        && revision >= 1
        && revision >= latestWorkspaceRevision
      );
      if (accepted) {
        latestWorkspaceRevision = revision;
        targetWindow.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = context;
        if (typeof onWorkspaceContextChange === 'function') {
          onWorkspaceContextChange(context);
        } else if (typeof targetWindow.CustomEvent === 'function') {
          targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT, {
            detail: { context },
          }));
        }
      }
      targetWindow.parent.postMessage({
        type: NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE,
        protocolVersion: 1,
        source: 'nohm-atlas',
        requestId,
        revision,
        accepted,
      }, targetWindow.location.origin);
      return;
    }
    const theme = String(event.data?.theme || '').toLowerCase();
    if (event.data?.type === NOHM_ATLAS_THEME_MESSAGE && NOHM_ATLAS_THEMES.includes(theme)) {
      if (typeof onThemeChange === 'function') {
        onThemeChange(theme);
      } else if (typeof targetWindow.CustomEvent === 'function') {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_THEME_EVENT, {
          detail: { theme },
        }));
      }
    }
  };
  targetWindow.addEventListener('message', handleMessage);
  scheduleNohmEmbedReady(targetWindow);
  return () => targetWindow.removeEventListener('message', handleMessage);
}
