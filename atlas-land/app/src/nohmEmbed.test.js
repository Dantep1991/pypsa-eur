import {
  announceNohmEmbedReady,
  NOHM_ATLAS_DOMAIN_MESSAGE,
  NOHM_ATLAS_THEME_EVENT,
  NOHM_ATLAS_THEME_MESSAGE,
  NOHM_ATLAS_READY_MESSAGE,
  NOHM_ATLAS_PING_MESSAGE,
  NOHM_ATLAS_WORKSPACE_CONTEXT_ACK_MESSAGE,
  NOHM_ATLAS_WORKSPACE_CONTEXT_EVENT,
  NOHM_ATLAS_WORKSPACE_CONTEXT_MESSAGE,
  normalizeNohmAtlasWorkspaceContext,
  scheduleNohmEmbedReady,
  startNohmEmbedBridge,
} from './nohmEmbed';

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
