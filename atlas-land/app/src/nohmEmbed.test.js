import {
  announceNohmEmbedReady,
  NOHM_ATLAS_DOMAIN_MESSAGE,
  NOHM_ATLAS_READY_MESSAGE,
  NOHM_ATLAS_PING_MESSAGE,
  scheduleNohmEmbedReady,
  startNohmEmbedBridge,
} from './nohmEmbed';

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
