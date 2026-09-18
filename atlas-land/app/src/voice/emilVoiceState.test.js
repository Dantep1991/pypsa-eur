import {
  EMIL_VOICE_MODES,
  emilVoiceReducer,
  emilVoiceStatusLabel,
  INITIAL_EMIL_VOICE_STATE,
  selectSpokenReply,
} from './emilVoiceState';

describe('EMIL voice state machine', () => {
  test('moves through a conversation turn and back to listening', () => {
    let state = emilVoiceReducer(INITIAL_EMIL_VOICE_STATE, { type: 'start', epoch: 1 });
    state = emilVoiceReducer(state, { type: 'mode', mode: EMIL_VOICE_MODES.CONVERSATION, epoch: 1 });
    state = emilVoiceReducer(state, { type: 'connected', epoch: 1 });
    state = emilVoiceReducer(state, { type: 'partial', text: 'add France', epoch: 1 });
    state = emilVoiceReducer(state, { type: 'enqueue', text: 'add France', queueDepth: 1, epoch: 1 });
    state = emilVoiceReducer(state, { type: 'executing', queueDepth: 1, epoch: 1 });
    state = emilVoiceReducer(state, { type: 'speaking', queueDepth: 0, epoch: 1 });
    expect(emilVoiceStatusLabel(state)).toMatch(/EMIL speaking/);
    state = emilVoiceReducer(state, { type: 'listening', queueDepth: 0, epoch: 1 });
    expect(state).toMatchObject({ active: true, mode: 'conversation', phase: 'listening', partial: '' });
  });

  test('ignores late events from an older voice session', () => {
    const current = { ...INITIAL_EMIL_VOICE_STATE, active: true, phase: 'listening', epoch: 8 };
    expect(emilVoiceReducer(current, { type: 'error', epoch: 7, message: 'late failure' })).toBe(current);
    expect(emilVoiceReducer(current, { type: 'speaking', epoch: 7 })).toBe(current);
  });

  test('stop preserves the chosen mode but clears private turn state', () => {
    const speaking = {
      ...INITIAL_EMIL_VOICE_STATE,
      active: true,
      mode: 'conversation',
      phase: 'speaking',
      speaking: true,
      partial: 'draft',
      queueDepth: 3,
      epoch: 2,
    };
    expect(emilVoiceReducer(speaking, { type: 'stop', epoch: 3 })).toEqual({
      ...INITIAL_EMIL_VOICE_STATE,
      mode: 'conversation',
      epoch: 3,
    });
  });

  test('selects the final stable reply rather than planner progress', () => {
    expect(selectSpokenReply([
      'Plan ready — applying 2 coordinated changes and checking the result.',
      'Loading Spain…',
      'Loaded Spain at NUTS3. Verified — the observed Atlas state matches your request.',
    ])).toBe('Loaded Spain at NUTS3. Verified — the observed Atlas state matches your request.');
  });
});
