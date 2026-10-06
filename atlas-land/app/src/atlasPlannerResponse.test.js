import { readAtlasPlannerResponse } from './atlasPlannerResponse';

test('model-owned Agent handoff never permits a partial map mutation', () => {
  const delegate = { intent: 'delegate_to_agent', params: {} };
  expect(readAtlasPlannerResponse({ provider: 'jev', confidence: 0.95, actions: [delegate] }).plan).toEqual([delegate]);
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence: 0.95,
    actions: [{ intent: 'control_experience', params: { action: 'inspect' } }, delegate] }).plan).toEqual([]);
});

const action = { intent: 'control_map_view', params: { operation: 'isolate', location: 'Paris' } };

test('accepts the Nohm shared-model plan unchanged', () => {
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence: 0.99, actions: [action] }))
    .toEqual({ status: 'ready', confidence: 0.99, plan: [action] });
});

test.each(['none', 'fallback', 'unavailable'])('does not execute an unavailable %s response', provider => {
  expect(readAtlasPlannerResponse({ provider, confidence: 1, actions: [action] }))
    .toEqual({ status: 'unavailable', confidence: 0, plan: [] });
});

test.each([null, [], { provider: 'nohm', error: 'Provider failed', actions: [action], confidence: 1 }])(
  'handles malformed/failed responses as outages', data => {
    expect(readAtlasPlannerResponse(data).status).toBe('unavailable');
    expect(readAtlasPlannerResponse(data).plan).toEqual([]);
  },
);

test.each([0, 0.1, NaN, Infinity, 'NaN'])('does not promote low/invalid confidence %s into authority', confidence => {
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence, actions: [action] }).plan).toEqual([]);
});

test('allows a clarification, but no accompanying low-confidence mutation', () => {
  const clarification = { intent: 'ask_clarification', params: { clarification: 'Which area?' } };
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence: 0, actions: [clarification] }).plan).toEqual([clarification]);
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence: 0, actions: [clarification, action] }).plan).toEqual([]);
});

test('retains the supported legacy single-intent schema', () => {
  expect(readAtlasPlannerResponse({ provider: 'nohm', confidence: 1, ...action }).plan).toEqual([action]);
});
