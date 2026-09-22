import {
  announceNohmAtlasViewState,
  announceNohmEmbedReady,
  announceNohmModelScene,
  NOHM_ATLAS_DOMAIN_MESSAGE,
  NOHM_ATLAS_ACTION_ACK_MESSAGE,
  NOHM_ATLAS_ACTION_EVENT,
  NOHM_ATLAS_ACTION_MESSAGE,
  NOHM_ATLAS_VIEW_STATE_MESSAGE,
  NOHM_ATLAS_THEME_EVENT,
  NOHM_ATLAS_THEME_MESSAGE,
  NOHM_ATLAS_READY_MESSAGE,
  NOHM_ATLAS_PING_MESSAGE,
  NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE,
  NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT,
  NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE,
  NOHM_ATLAS_RUN_STATE_EVENT,
  NOHM_ATLAS_RUN_STATE_MESSAGE,
  NOHM_ATLAS_BUILDER_DRAFT_EVENT,
  NOHM_ATLAS_BUILDER_DRAFT_MESSAGE,
  NOHM_ATLAS_MODEL_SCENE_MESSAGE,
  NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
  normalizeNohmAtlasWorkspaceContext,
  normalizeNohmAtlasViewState,
  normalizeNohmAtlasRunState,
  normalizeNohmAtlasBuilderDraftPreview,
  acknowledgeNohmAtlasAction,
  scheduleNohmEmbedReady,
  requestNohmAtlasPortal,
  startNohmEmbedBridge,
} from './nohmEmbed';

test('Atlas accepts only a builder preview bound to the exact loaded model', () => {
  const callbacks = new Map();
  const dispatched = [];
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    dispatchEvent: (event) => dispatched.push({ type: event.type, detail: event.detail }),
    __NOHM_ATLAS_WORKSPACE_CONTEXT__: { mode: 'model', projectId: 'TYNDP_2026', version: 'v3.0.0' },
  };
  startNohmEmbedBridge(target);
  const preview = {
    projectId: 'TYNDP_2026', draftId: 'atlas-v3', sourceVersion: 'v3.0.0', revision: 3,
    stageId: 'skeleton', stageLabel: 'Geography', stageIndex: 3, stageCount: 11,
    mode: 'definitions-only', geometryStatus: 'not-ready',
    staleStageIds: ['organs', 'invalid-stage', 'cardio_system', 'organs'],
    evidence: { carrierCount: 1, countryCount: 0, nodeDefinitionCount: 0, assetCarrierCount: 0, connectionGroupCount: 0 },
    message: 'Definitions only.',
  };
  callbacks.get('message')({ source: parent, origin: target.location.origin, data: {
    type: NOHM_ATLAS_BUILDER_DRAFT_MESSAGE, protocolVersion: 1, source: 'nohm-shell', preview,
  } });
  expect(dispatched.at(-1)).toEqual({
    type: NOHM_ATLAS_BUILDER_DRAFT_EVENT,
    detail: { preview: normalizeNohmAtlasBuilderDraftPreview(preview) },
  });
  expect(dispatched.at(-1).detail.preview.staleStageIds).toEqual(['organs', 'cardio_system']);
  const acceptedCount = dispatched.length;
  callbacks.get('message')({ source: parent, origin: target.location.origin, data: {
    type: NOHM_ATLAS_BUILDER_DRAFT_MESSAGE, protocolVersion: 1, source: 'nohm-shell',
    preview: { ...preview, sourceVersion: 'v4.0.0' },
  } });
  expect(dispatched).toHaveLength(acceptedCount);
  callbacks.get('message')({ source: parent, origin: target.location.origin, data: {
    type: NOHM_ATLAS_BUILDER_DRAFT_MESSAGE, protocolVersion: 1, source: 'nohm-shell', preview: null,
  } });
  expect(dispatched.at(-1)).toEqual({ type: NOHM_ATLAS_BUILDER_DRAFT_EVENT, detail: { preview: null } });
});

test('Atlas accepts run state only for the exact bound project and model version', () => {
  const callbacks = new Map();
  const dispatched = [];
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    dispatchEvent: (event) => dispatched.push({ type: event.type, detail: event.detail }),
  };
  startNohmEmbedBridge(target);
  target.__NOHM_ATLAS_WORKSPACE_CONTEXT__ = {
    mode: 'model', projectId: 'TYNDP_2026', version: 'v3.0.0',
  };
  callbacks.get('message')({
    source: target.parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_RUN_STATE_MESSAGE, protocolVersion: 1, source: 'nohm-shell',
      runState: { projectId: 'TYNDP_2026', modelVersion: 'v3.0.0', status: 'running', runCount: 1, activeCount: 1 },
    },
  });
  expect(dispatched.at(-1)).toEqual({
    type: NOHM_ATLAS_RUN_STATE_EVENT,
    detail: { runState: normalizeNohmAtlasRunState({ projectId: 'TYNDP_2026', modelVersion: 'v3.0.0', status: 'running', runCount: 1, activeCount: 1 }) },
  });
  const acceptedCount = dispatched.length;
  callbacks.get('message')({
    source: target.parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_RUN_STATE_MESSAGE, protocolVersion: 1, source: 'nohm-shell',
      runState: { projectId: 'TYNDP_2026', modelVersion: 'v4.0.0', status: 'running', runCount: 1, activeCount: 1 },
    },
  });
  expect(dispatched).toHaveLength(acceptedCount);
});

test('Atlas defers an unresolved bridge version to the application exact-version guard', () => {
  const callbacks = new Map();
  const dispatched = [];
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    CustomEvent: class CustomEvent {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    dispatchEvent: (event) => dispatched.push(event),
    __NOHM_ATLAS_WORKSPACE_CONTEXT__: { mode: 'model', projectId: 'TYNDP_2026', version: null },
  };
  startNohmEmbedBridge(target);
  callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_RUN_STATE_MESSAGE, protocolVersion: 1, source: 'nohm-shell',
      runState: { projectId: 'TYNDP_2026', modelVersion: 'v3.0.0', status: 'idle', runCount: 0, activeCount: 0 },
    },
  });
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0].detail.runState.modelVersion).toBe('v3.0.0');
});

test('workspace contexts retain only the versioned Atlas binding contract', () => {
  expect(normalizeNohmAtlasWorkspaceContext({
    mode: 'model',
    projectId: ' TYNDP_2026 ',
    projectName: ' TYNDP 2026 ',
    version: ' v2.5.2 ',
    nativeGeography: { id: 'bidding_zone', label: 'Bidding zones', resolved: true },
    ignored: 'not retained',
  })).toEqual({
    mode: 'model',
    projectId: 'TYNDP_2026',
    projectName: 'TYNDP 2026',
    modelId: null,
    version: 'v2.5.2',
    scenario: null,
    nativeGeography: { id: 'bidding_zone', label: 'Bidding zones', resolved: true },
  });
});

test('standalone Atlas does not announce to itself', () => {
  const target = { location: { origin: 'https://nohm.example.test' } };
  target.parent = target;
  expect(announceNohmEmbedReady(target)).toBe(false);
});

test('the embed bridge answers only a same-origin shell ping and can be removed', () => {
  const callbacks = new Map();
  const frames = [];
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: (callback) => frames.push(callback),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
  };
  const stop = startNohmEmbedBridge(target);
  expect(target.document.documentElement.setAttribute).toHaveBeenCalledWith('data-nohm-atlas-ready', '1');
  parent.postMessage.mockClear();
  callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: { type: NOHM_ATLAS_PING_MESSAGE, protocolVersion: 1, source: 'nohm-shell' },
  });
  expect(parent.postMessage).toHaveBeenCalledTimes(1);
  callbacks.get('message')({
    source: parent,
    origin: 'https://other.example.test',
    data: { type: NOHM_ATLAS_PING_MESSAGE, protocolVersion: 1, source: 'nohm-shell' },
  });
  expect(parent.postMessage).toHaveBeenCalledTimes(1);
  stop();
  expect(target.removeEventListener).toHaveBeenCalledWith('message', callbacks.get('message'));
});

test('the embed bridge accepts only validated Atlas Domain commands from the Nohm shell', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const onDomainChange = jest.fn();
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
  };
  startNohmEmbedBridge(target, { onDomainChange });
  const send = (overrides = {}) => callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_DOMAIN_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      domain: 'visualise',
    },
    ...overrides,
  });
  send();
  expect(onDomainChange).toHaveBeenCalledWith('visualise');
  send({ data: { type: NOHM_ATLAS_DOMAIN_MESSAGE, protocolVersion: 1, source: 'nohm-shell', domain: 'invalid' } });
  send({ origin: 'https://other.example.test' });
  expect(onDomainChange).toHaveBeenCalledTimes(1);
});

test('the embed bridge accepts only supported themes from the Nohm shell', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const onThemeChange = jest.fn();
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
  };
  startNohmEmbedBridge(target, { onThemeChange });
  const send = (theme, overrides = {}) => callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_THEME_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      theme,
    },
    ...overrides,
  });
  send('horizon');
  expect(onThemeChange).toHaveBeenCalledWith('horizon');
  send('system');
  send('light', { origin: 'https://other.example.test' });
  expect(onThemeChange).toHaveBeenCalledTimes(1);
});

test('the default theme bridge publishes a window event for the Atlas application', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    CustomEvent: function CustomEvent(type, options) { return { type, ...options }; },
  };
  startNohmEmbedBridge(target);
  callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_THEME_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      theme: 'light',
    },
  });
  expect(target.dispatchEvent).toHaveBeenCalledWith({
    type: NOHM_ATLAS_THEME_EVENT,
    detail: { theme: 'light' },
  });
});

test('the embed bridge dispatches only allowlisted same-origin Atlas actions', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    CustomEvent: function CustomEvent(type, options) { return { type, ...options }; },
  };
  startNohmEmbedBridge(target);
  const send = (actionId, overrides = {}) => callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_ACTION_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      requestId: 'atlas-action-7',
      actionId,
    },
    ...overrides,
  });
  send('display.hide-nodes', {
    data: {
      type: NOHM_ATLAS_ACTION_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      requestId: 'atlas-action-7',
      actionId: 'display.hide-nodes',
      expectedRevision: 12,
    },
  });
  expect(target.dispatchEvent).toHaveBeenCalledWith({
    type: NOHM_ATLAS_ACTION_EVENT,
    detail: { requestId: 'atlas-action-7', actionId: 'display.hide-nodes', expectedRevision: 12 },
  });
  send('system.delete-data');
  send('map.zoom-in', { origin: 'https://other.example.test' });
  expect(target.dispatchEvent).toHaveBeenCalledTimes(1);
});

test('the action allowlist supports explicit layer add and hide semantics', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    CustomEvent: function CustomEvent(type, options) { return { type, ...options }; },
  };
  startNohmEmbedBridge(target);
  ['layer.add-supply', 'layer.hide-supply'].forEach((actionId, index) => callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_ACTION_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      requestId: `atlas-layer-${index}`,
      actionId,
    },
  }));
  expect(target.dispatchEvent).toHaveBeenCalledTimes(2);
});

test('embedded Atlas returns an exact action receipt to its same-origin shell', () => {
  const parent = { postMessage: jest.fn() };
  const target = { parent, location: { origin: 'https://nohm.example.test' } };
  expect(acknowledgeNohmAtlasAction({
    requestId: 'atlas-action-8',
    actionId: 'map.zoom-in',
    status: 'applied',
    summary: 'Zoomed in one level.',
    observed: { operation: 'zoom_in' },
  }, target)).toBe(true);
  expect(parent.postMessage).toHaveBeenCalledWith({
    type: NOHM_ATLAS_ACTION_ACK_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    requestId: 'atlas-action-8',
    actionId: 'map.zoom-in',
    status: 'applied',
    summary: 'Zoomed in one level.',
    observed: { operation: 'zoom_in' },
    viewRevision: null,
  }, target.location.origin);
  expect(acknowledgeNohmAtlasAction({ requestId: 'bad', actionId: 'system.delete-data', status: 'applied' }, target)).toBe(false);
  expect(parent.postMessage).toHaveBeenCalledTimes(1);
});

test('embedded Atlas publishes a closed monotonic view-state snapshot', () => {
  const parent = { postMessage: jest.fn() };
  const target = { parent, location: { origin: 'https://nohm.example.test' } };
  const state = normalizeNohmAtlasViewState({
    nodeMarkers: true,
    geographicBoundaries: false,
    generationMix: true,
    networkResolution: 'nuts3',
    layers: { Grid: true, Supply: true, ignored: true },
    viewport: { lat: 48.8, lng: 2.3, zoom: 7, ignored: 1 },
    ignored: 'not transported',
  });
  expect(announceNohmAtlasViewState({ revision: 9, state }, target)).toBe(true);
  expect(parent.postMessage).toHaveBeenCalledWith({
    type: NOHM_ATLAS_VIEW_STATE_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    revision: 9,
    state: {
      nodeMarkers: true,
      geographicBoundaries: false,
      generationMix: true,
      networkResolution: 'nuts3',
      layers: { Grid: true, Supply: true, Storage: false, Demand: false, Access: false },
      viewport: { lat: 48.8, lng: 2.3, zoom: 7 },
    },
  }, target.location.origin);
  expect(announceNohmAtlasViewState({ revision: 0, state }, target)).toBe(false);
});

test('workspace context is acknowledged and stale revisions cannot replace newer model state', () => {
  const callbacks = new Map();
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'https://nohm.example.test' },
    document: { documentElement: { setAttribute: jest.fn() } },
    requestAnimationFrame: jest.fn(),
    addEventListener: (name, callback) => callbacks.set(name, callback),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
    CustomEvent: function CustomEvent(type, options) { return { type, ...options }; },
  };
  startNohmEmbedBridge(target);
  const send = (revision, projectId) => callbacks.get('message')({
    source: parent,
    origin: target.location.origin,
    data: {
      type: NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE,
      protocolVersion: 1,
      source: 'nohm-shell',
      requestId: `context-${revision}`,
      revision,
      context: { mode: 'model', projectId, projectName: projectId },
    },
  });
  send(2, 'new-model');
  send(1, 'old-model');
  expect(target.__NOHM_ATLAS_WORKSPACE_CONTEXT__.projectId).toBe('new-model');
  expect(target.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
    type: NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT,
  }));
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
    type: NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE,
    requestId: 'context-1',
    accepted: false,
  }), target.location.origin);
});

test('embedded Atlas announces a versioned readiness contract to its same origin parent', () => {
  const parent = { postMessage: jest.fn() };
  const target = { parent, location: { origin: 'https://nohm.example.test' } };
  expect(announceNohmEmbedReady(target)).toBe(true);
  expect(parent.postMessage).toHaveBeenCalledWith({
    type: NOHM_ATLAS_READY_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
  }, 'https://nohm.example.test');
});

test('embedded Atlas reports the exact canonical scene it loaded', () => {
  const parent = { postMessage: jest.fn() };
  const target = { parent, location: { origin: 'https://nohm.example.test' } };
  expect(announceNohmModelScene({
    projectId: 'TYNDP_2026',
    version: 'v3.0.0',
    selectedYear: 2030,
    nodeCount: 105,
    linkCount: 178,
  }, target)).toBe(true);
  expect(parent.postMessage).toHaveBeenCalledWith({
    type: NOHM_ATLAS_MODEL_SCENE_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    projectId: 'TYNDP_2026',
    version: 'v3.0.0',
    selectedYear: 2030,
    nodeCount: 105,
    linkCount: 178,
  }, target.location.origin);
  expect(announceNohmModelScene({ projectId: 'TYNDP_2026' }, target)).toBe(false);
});

test('embedded Atlas requests only allowlisted host-owned portals', () => {
  const parent = { postMessage: jest.fn() };
  const target = { parent, location: { origin: 'https://nohm.example.test' } };
  expect(requestNohmAtlasPortal('model-builder', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'model-builder',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('explore-model', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'explore-model',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('model-operations', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'model-operations',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('model-runs', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'model-runs',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('visualisation', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'visualisation',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('analysis', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'analysis',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('climate', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'climate',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('commodity', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'commodity',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('lola-flow', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'lola-flow',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('cba', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'cba',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('economic-assessment', target)).toBe(true);
  expect(parent.postMessage).toHaveBeenLastCalledWith({
    type: NOHM_ATLAS_PORTAL_REQUEST_MESSAGE,
    protocolVersion: 1,
    source: 'nohm-atlas',
    target: 'economic-assessment',
  }, target.location.origin);
  expect(requestNohmAtlasPortal('admin', target)).toBe(false);
  expect(parent.postMessage).toHaveBeenCalledTimes(11);
});

test('scheduled readiness waits until the rendered frame', () => {
  const callbacks = [];
  const parent = { postMessage: jest.fn() };
  const target = {
    parent,
    location: { origin: 'http://127.0.0.1:5176' },
    requestAnimationFrame: (callback) => callbacks.push(callback),
  };
  expect(scheduleNohmEmbedReady(target)).toBe(true);
  expect(parent.postMessage).not.toHaveBeenCalled();
  callbacks.shift()();
  expect(parent.postMessage).not.toHaveBeenCalled();
  callbacks.shift()();
  expect(parent.postMessage).toHaveBeenCalledTimes(1);
});
