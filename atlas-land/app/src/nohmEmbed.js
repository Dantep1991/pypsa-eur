export const NOHM_ATLAS_READY_MESSAGE = 'nohm.atlas.ready.v1';
export const NOHM_ATLAS_PING_MESSAGE = 'nohm.atlas.ping.v1';
export const NOHM_ATLAS_DOMAIN_MESSAGE = 'nohm.atlas.domain.v1';
export const NOHM_ATLAS_DOMAIN_EVENT = 'nohm:atlas-domain';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE = 'nohm.atlas.workspace-context.v1';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE = 'nohm.atlas.workspace-context.ack.v1';
export const NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT = 'nohm:atlas-workspace-context';
export const NOHM_ATLAS_MODEL_SCENE_MESSAGE = 'nohm.atlas.model-scene.v1';
export const NOHM_ATLAS_PORTAL_REQUEST_MESSAGE = 'nohm.atlas.portal.request.v1';
export const NOHM_ATLAS_ACTION_MESSAGE = 'nohm.atlas.action.v1';
export const NOHM_ATLAS_ACTION_ACK_MESSAGE = 'nohm.atlas.action.ack.v1';
export const NOHM_ATLAS_ACTION_EVENT = 'nohm:atlas-action';
export const NOHM_ATLAS_VIEW_STATE_MESSAGE = 'nohm.atlas.view-state.v1';
export const NOHM_ATLAS_RUN_STATE_MESSAGE = 'nohm.atlas.run-state.v1';
export const NOHM_ATLAS_RUN_STATE_EVENT = 'nohm:atlas-run-state';
export const NOHM_ATLAS_BUILDER_DRAFT_MESSAGE = 'nohm.atlas.builder-draft.v1';
export const NOHM_ATLAS_BUILDER_DRAFT_EVENT = 'nohm:atlas-builder-draft';
export const NOHM_ATLAS_THEME_MESSAGE = 'nohm.atlas.theme.v1';
export const NOHM_ATLAS_THEME_EVENT = 'nohm:atlas-theme';
export const NOHM_ATLAS_ASSISTANT_MODE_MESSAGE = 'nohm.atlas.assistant-mode.v1';
export const NOHM_ATLAS_ASSISTANT_MODE_EVENT = 'nohm:atlas-assistant-mode';
export const NOHM_ATLAS_ASSISTANT_DOCK_MESSAGE = 'nohm.atlas.assistant-dock.v1';
export const NOHM_ATLAS_DOMAINS = Object.freeze(['model', 'operate', 'visualise', 'explore']);
export const NOHM_ATLAS_THEMES = Object.freeze(['dark', 'light', 'horizon', 'meridian']);
export const NOHM_ATLAS_PORTAL_TARGETS = Object.freeze([
  'model-builder',
  'explore-model',
  'demand',
  'model-operations',
  'model-runs',
  'visualisation',
  'synapse-network',
  'analysis',
  'climate',
  'commodity',
  'lola-flow',
  'cba',
  'economic-assessment',
]);
const NOHM_BUILDER_STAGE_IDS = Object.freeze([
  'soul', 'dna', 'skeleton', 'organs', 'cardio_system', 'blood', 'blood_chemistry',
  'circadian_system', 'nervous_system', 'skin', 'muscles',
]);
export const NOHM_ATLAS_ACTIONS = Object.freeze([
  'map.zoom-in',
  'map.zoom-out',
  'map.fit-visible',
  'map.reset',
  'display.show-nodes',
  'display.hide-nodes',
  'display.show-boundaries',
  'display.hide-boundaries',
  'resolution.increase',
  'resolution.decrease',
  'layer.grid',
  'layer.supply',
  'layer.storage',
  'layer.demand',
  'layer.access',
  'layer.add-grid',
  'layer.add-supply',
  'layer.add-storage',
  'layer.add-demand',
  'layer.add-access',
  'layer.hide-grid',
  'layer.hide-supply',
  'layer.hide-storage',
  'layer.hide-demand',
  'layer.hide-access',
  'generation.show',
  'generation.hide',
]);

function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeNohmAtlasViewState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const layers = source.layers && typeof source.layers === 'object' ? source.layers : {};
  const viewport = source.viewport && typeof source.viewport === 'object' ? source.viewport : {};
  return {
    nodeMarkers: Boolean(source.nodeMarkers),
    geographicBoundaries: Boolean(source.geographicBoundaries),
    generationMix: Boolean(source.generationMix),
    networkResolution: optionalText(source.networkResolution),
    layers: Object.fromEntries(['Grid', 'Supply', 'Storage', 'Demand', 'Access']
      .map((key) => [key, Boolean(layers[key])])),
    viewport: {
      lat: finiteNumber(viewport.lat),
      lng: finiteNumber(viewport.lng),
      zoom: finiteNumber(viewport.zoom),
    },
  };
}

export function announceNohmAtlasViewState(payload, targetWindow = window) {
  const revision = Number(payload?.revision);
  if (!targetWindow?.parent || targetWindow.parent === targetWindow
      || !Number.isInteger(revision) || revision < 1) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_VIEW_STATE_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    revision,
    state: normalizeNohmAtlasViewState(payload?.state),
  }, targetWindow.location.origin);
  return true;
}

export function normalizeNohmAtlasWorkspaceContext(context) {
  if (!context || typeof context !== 'object') return null;
  const projectId = optionalText(context.projectId);
  const networkCatalogue = projectId && context.mode === 'catalogue'
    && context.networkCatalogue?.id === 'pypsa-eur'
    && context.networkCatalogue?.projectId === projectId
    ? { id: 'pypsa-eur', projectId } : null;
  const mode = networkCatalogue ? 'catalogue' : projectId ? 'model' : 'reference';
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
    ...(networkCatalogue ? { networkCatalogue } : {}),
    projectName: optionalText(context.projectName) || projectId || 'Reference Atlas',
    modelId: optionalText(context.modelId),
    ...(optionalText(context.modelName) ? { modelName: optionalText(context.modelName) } : {}),
    version: optionalText(context.version),
    scenario: optionalText(context.scenario),
    nativeGeography: geography,
  };
}

export function readNohmAtlasWorkspaceContextFromLocation(location) {
  const search = optionalText(location?.search);
  if (!search) return null;
  const params = new URLSearchParams(search);
  if (params.get('nohm-context') !== '1') return null;
  return normalizeNohmAtlasWorkspaceContext({
    mode: params.get('mode'),
    networkCatalogue: { id: params.get('networkCatalogue'), projectId: params.get('catalogueProject') },
    projectId: params.get('project'),
    projectName: params.get('projectName'),
    modelId: params.get('model'),
    modelName: params.get('modelName'),
    version: params.get('version'),
    scenario: params.get('scenario'),
    nativeGeography: {
      id: params.get('geography'),
      label: params.get('geographyLabel'),
      resolved: params.get('geographyResolved') === '1',
    },
  });
}

export function normalizeNohmAtlasRunState(value) {
  const projectId = optionalText(value?.projectId);
  const modelVersion = optionalText(value?.modelVersion);
  const modelName = optionalText(value?.modelName);
  const allowedStatuses = ['idle', 'prepared', 'running', 'verifying', 'completed', 'failed', 'orphaned', 'unknown'];
  const status = allowedStatuses.includes(value?.status) ? value.status : null;
  const runCount = Number(value?.runCount);
  const activeCount = Number(value?.activeCount);
  const versionActiveCount = Number(value?.versionActiveCount ?? activeCount);
  if (!projectId || !modelVersion || !status
      || !Number.isSafeInteger(runCount) || runCount < 0
      || !Number.isSafeInteger(activeCount) || activeCount < 0 || activeCount > runCount
      || !Number.isSafeInteger(versionActiveCount) || versionActiveCount < activeCount) return null;
  const latestSource = value?.latest && typeof value.latest === 'object' ? value.latest : null;
  const latest = latestSource ? {
    runId: optionalText(latestSource.runId),
    label: optionalText(latestSource.label),
    modelName: optionalText(latestSource.modelName),
    status: allowedStatuses.includes(latestSource.status) ? latestSource.status : 'unknown',
    rawStatus: optionalText(latestSource.rawStatus),
    phase: optionalText(latestSource.phase),
    startedAt: optionalText(latestSource.startedAt),
    completedAt: optionalText(latestSource.completedAt),
    verificationVerdict: optionalText(latestSource.verificationVerdict),
    outputVerified: latestSource.outputVerified === true,
    resultIdentity: optionalText(latestSource.resultIdentity),
  } : null;
  if (latest && (!latest.runId || (modelName && latest.modelName !== modelName))) return null;
  return {
    projectId,
    modelVersion,
    modelName,
    status,
    runCount,
    activeCount,
    versionActiveCount,
    refreshedAt: optionalText(value.refreshedAt),
    latest,
    verifiedResultReceipt: optionalText(value.verifiedResultReceipt),
  };
}

export function normalizeNohmAtlasBuilderDraftPreview(value) {
  if (!value || typeof value !== 'object') return null;
  const projectId = optionalText(value.projectId);
  const draftId = optionalText(value.draftId);
  const sourceVersion = optionalText(value.sourceVersion);
  const stageId = optionalText(value.stageId);
  const stageLabel = optionalText(value.stageLabel);
  const revision = Number(value.revision);
  const stageIndex = Number(value.stageIndex);
  const stageCount = Number(value.stageCount);
  const sourceEvidence = value.evidence && typeof value.evidence === 'object' ? value.evidence : {};
  const staleStageIds = [...new Set((Array.isArray(value.staleStageIds) ? value.staleStageIds : [])
    .map(optionalText).filter((stageId) => NOHM_BUILDER_STAGE_IDS.includes(stageId)))];
  const allowedModes = ['definitions-only', 'assembly-progress', 'assembled-summary'];
  const allowedGeometry = ['not-ready', 'identifiers-selected', 'assembled-no-geometry', 'resolved-preview'];
  const mode = allowedModes.includes(value.mode) ? value.mode : null;
  const sourceAssembly = value.assembly && typeof value.assembly === 'object' ? value.assembly : null;
  const assemblyCounts = sourceAssembly ? Object.fromEntries([
    'completed', 'total', 'classCount', 'objectCount', 'membershipCount', 'propertyRecordCount',
    'nodeCount', 'mappedNodeCount', 'linkCount', 'assetCount',
  ].map((key) => [key, Number(sourceAssembly[key])])) : null;
  const assemblyStatus = ['queued', 'running', 'finalising', 'complete', 'error'].includes(sourceAssembly?.status)
    ? sourceAssembly.status
    : null;
  const assembly = sourceAssembly && assemblyStatus && assemblyCounts
    && Object.values(assemblyCounts).every((count) => Number.isSafeInteger(count) && count >= 0)
    && assemblyCounts.total >= 1 && assemblyCounts.completed <= assemblyCounts.total
    ? {
      previewId: optionalText(sourceAssembly.previewId),
      status: assemblyStatus,
      phase: optionalText(sourceAssembly.phase),
      sceneAvailable: sourceAssembly.sceneAvailable === true,
      ...assemblyCounts,
    }
    : null;
  const evidence = Object.fromEntries([
    'carrierCount', 'countryCount', 'nodeDefinitionCount', 'assetCarrierCount', 'connectionGroupCount',
  ].map((key) => [key, Number(sourceEvidence[key])]));
  if (!projectId || !draftId || !stageId || !stageLabel
      || !Number.isSafeInteger(revision) || revision < 0
      || !Number.isSafeInteger(stageIndex) || stageIndex < 1
      || !Number.isSafeInteger(stageCount) || stageCount < stageIndex
      || !mode || !allowedGeometry.includes(value.geometryStatus)
      || (mode === 'definitions-only' ? assembly !== null : assembly === null)
      || (mode === 'assembled-summary' && (
        assembly?.status !== 'complete'
        || !['assembled-no-geometry', 'resolved-preview'].includes(value.geometryStatus)
      ))
      || (value.geometryStatus === 'resolved-preview' && (mode !== 'assembled-summary' || !assembly?.sceneAvailable || assembly.mappedNodeCount < 1))
      || (assembly?.sceneAvailable && value.geometryStatus !== 'resolved-preview')
      || Object.values(evidence).some((count) => !Number.isSafeInteger(count) || count < 0)) return null;
  return {
    projectId,
    draftId,
    sourceVersion,
    revision,
    stageId,
    stageLabel,
    stageIndex,
    stageCount,
    mode,
    geometryStatus: value.geometryStatus,
    staleStageIds,
    assembly,
    evidence,
    message: optionalText(value.message),
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
    ...(optionalText(scene?.modelName) ? { modelName: optionalText(scene.modelName) } : {}),
    ...(Array.isArray(scene?.assetClasses) ? { assetClasses: scene.assetClasses } : {}),
    selectedYear,
    nodeCount,
    linkCount,
  }, targetWindow.location.origin);
  return true;
}

export function requestNohmAtlasPortal(target, targetWindow = window) {
  const safeTarget = optionalText(target);
  if (!targetWindow?.parent || targetWindow.parent === targetWindow
      || !NOHM_ATLAS_PORTAL_TARGETS.includes(safeTarget)) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: safeTarget,
  }, targetWindow.location.origin);
  return true;
}

export function requestNohmAtlasAssistantMode(mode, targetWindow = window) {
  if (!targetWindow?.parent || targetWindow.parent === targetWindow
      || !['atlas', 'agent'].includes(mode)) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_ASSISTANT_MODE_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    mode,
  }, targetWindow.location.origin);
  return true;
}

export function acknowledgeNohmAtlasAction(receipt, targetWindow = window) {
  const requestId = optionalText(receipt?.requestId);
  const actionId = optionalText(receipt?.actionId);
  const status = receipt?.status === 'applied' ? 'applied' : receipt?.status === 'rejected' ? 'rejected' : null;
  if (!targetWindow?.parent || targetWindow.parent === targetWindow || !requestId
      || !NOHM_ATLAS_ACTIONS.includes(actionId) || !status) return false;
  targetWindow.parent.postMessage({
    type: NOHM_ATLAS_ACTION_ACK_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    requestId,
    actionId,
    status,
    summary: optionalText(receipt?.summary),
    observed: receipt?.observed && typeof receipt.observed === 'object' ? receipt.observed : null,
    viewRevision: Number.isInteger(receipt?.viewRevision) && receipt.viewRevision >= 1
      ? receipt.viewRevision
      : null,
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
    if (event.data?.type === NOHM_ATLAS_ASSISTANT_DOCK_MESSAGE) {
      const { bottomPx, rightPx } = event.data;
      if (![bottomPx, rightPx].every((value) => Number.isInteger(value) && value >= 0 && value <= 10000)) return;
      const style = targetWindow.document?.documentElement?.style;
      style?.setProperty('--nohm-assistant-bottom', `${bottomPx}px`);
      style?.setProperty('--nohm-assistant-right', `${rightPx}px`);
      return;
    }
    if (event.data?.type === NOHM_ATLAS_ASSISTANT_MODE_MESSAGE
        && ['atlas', 'agent'].includes(event.data?.mode)) {
      targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_ASSISTANT_MODE_EVENT, {
        detail: { mode: event.data.mode },
      }));
      return;
    }
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
    if (event.data?.type === NOHM_ATLAS_RUN_STATE_MESSAGE) {
      const runState = normalizeNohmAtlasRunState(event.data?.runState);
      const context = targetWindow.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
      if (!runState || context?.mode !== 'model'
          || runState.projectId !== context.projectId
          || (context.version && runState.modelVersion !== context.version)
          || (runState.modelName || null) !== (context.modelName || null)) return;
      if (typeof targetWindow.CustomEvent === 'function') {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_RUN_STATE_EVENT, {
          detail: { runState },
        }));
      }
      return;
    }
    if (event.data?.type === NOHM_ATLAS_BUILDER_DRAFT_MESSAGE) {
      const preview = event.data?.preview === null
        ? null
        : normalizeNohmAtlasBuilderDraftPreview(event.data?.preview);
      const context = targetWindow.__NOHM_ATLAS_WORKSPACE_CONTEXT__;
      if (event.data?.preview !== null && (!preview || context?.mode !== 'model'
          || preview.projectId !== context.projectId
          || (context.version && preview.sourceVersion !== context.version))) return;
      if (typeof targetWindow.CustomEvent === 'function') {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_BUILDER_DRAFT_EVENT, {
          detail: { preview },
        }));
      }
      return;
    }
    if (event.data?.type === NOHM_ATLAS_ACTION_MESSAGE) {
      const requestId = optionalText(event.data?.requestId);
      const actionId = optionalText(event.data?.actionId);
      if (!requestId || !NOHM_ATLAS_ACTIONS.includes(actionId)) return;
      const expectedRevision = Number(event.data?.expectedRevision);
      if (typeof targetWindow.CustomEvent === 'function') {
        targetWindow.dispatchEvent(new targetWindow.CustomEvent(NOHM_ATLAS_ACTION_EVENT, {
          detail: {
            requestId,
            actionId,
            expectedRevision: Number.isInteger(expectedRevision) && expectedRevision >= 1
              ? expectedRevision
              : null,
          },
        }));
      }
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
