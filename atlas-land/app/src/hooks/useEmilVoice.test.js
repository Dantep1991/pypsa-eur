import { act, cleanup, renderHook } from '@testing-library/react';
import useEmilVoice from './useEmilVoice';
import { NohmRealtimeVoiceSession } from '../voice/realtimeVoice';
import { requestNohmMicStream } from '../voice/browserVoiceCapture';

jest.mock('../voice/realtimeVoice', () => ({ NohmRealtimeVoiceSession: jest.fn() }));
jest.mock('../voice/browserVoiceCapture', () => ({
  ...jest.requireActual('../voice/browserVoiceCapture'), requestNohmMicStream: jest.fn(),
}));

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const mic = () => {
  const track = { readyState: 'live', stop: jest.fn() };
  return { getTracks: () => [track], getAudioTracks: () => [track], track };
};
const flush = async () => { await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }); };
const tick = async (ms = 100) => { await act(async () => { jest.advanceTimersByTime(ms); }); await flush(); };
let sessions;
let stream;

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
  sessions = [];
  stream = mic();
  requestNohmMicStream.mockReset().mockResolvedValue(stream);
  NohmRealtimeVoiceSession.mockReset().mockImplementation((options) => {
    const session = { options, stop: jest.fn(), start: jest.fn(async () => options.onStatus('listening')) };
    sessions.push(session);
    return session;
  });
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ready: true }) }));
});

test.each(['headers', 'body'].flatMap(stage => ['timeout', 'restart'].map(reason => [stage, reason])))
  ('fallback transcription recovers from stalled %s after %s without a late command', async (stage, reason) => {
    const originalRecorder = window.MediaRecorder;
    const recorders = [];
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['x'.repeat(300)], { type: 'audio/webm' }) });
        this.onstop?.();
      }
    };
    try {
      const held = deferred();
      global.fetch.mockImplementationOnce(() => stage === 'headers' ? held.promise
        : Promise.resolve({ ok: true, json: () => held.promise }))
        .mockImplementation(async () => ({ ok: true, json: async () => ({ text: 'retry command' }) }));
      const onCommand = jest.fn();
      const transcriptionContext = { language: '', prompt: 'Atlas geography', keywords: ['France', 'NUTS3'] };
      const view = setup({ onCommand, transcriptionContext });
      await start(view);
      act(() => sessions.at(-1).options.onError(new Error('connection lost'), { fatal: true }));
      act(() => view.result.current.toggle());
      await flush();
      expect(recorders).toHaveLength(1);
      act(() => view.result.current.toggle());
      await flush();
      const signal = global.fetch.mock.calls[0][1].signal;
      const body = global.fetch.mock.calls[0][1].body;
      expect(body.get('prompt')).toBe('Atlas geography');
      expect(JSON.parse(body.get('keywords'))).toEqual(['France', 'NUTS3']);
      if (reason === 'timeout') {
        await tick(65000);
        expect(view.result.current.error).toMatch(/Transcription timed out/);
      } else {
        act(() => view.result.current.stop());
        await start(view);
        act(() => sessions.at(-1).options.onError(new Error('connection lost'), { fatal: true }));
      }
      expect(signal.aborted).toBe(true);
      act(() => view.result.current.toggle());
      await flush();
      expect(recorders).toHaveLength(2);
      act(() => view.result.current.toggle());
      await flush();
      await tick(); await tick();
      expect(onCommand.mock.calls.map(([text]) => text)).toEqual(['retry command']);
      const decode = jest.fn(async () => ({ text: 'stale command' }));
      held.resolve(stage === 'headers' ? { ok: true, json: decode } : { text: 'stale command' });
      await flush(); await tick();
      expect(decode).not.toHaveBeenCalled();
      expect(onCommand.mock.calls.map(([text]) => text)).toEqual(['retry command']);
    } finally {
      window.MediaRecorder = originalRecorder;
    }
  });
afterEach(() => { cleanup(); jest.useRealTimers(); });

const setup = (props = {}) => renderHook((value) => useEmilVoice(value), {
  initialProps: { apiBase: '/api/voice', busy: false, onCommand: jest.fn(), ...props },
});
const start = async (view) => { act(() => view.result.current.toggle()); await flush(); };
const transcript = async (text, session = sessions.at(-1)) => {
  act(() => session.options.onTranscript(text, { item_id: text }));
  await flush();
};

test.each(['/api/voice', '/api/nohm/voice'])('idle Atlas does not call unused speech status endpoints (%s)', async apiBase => {
  setup({ apiBase });
  await flush();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(requestNohmMicStream).not.toHaveBeenCalled();
  expect(NohmRealtimeVoiceSession).not.toHaveBeenCalled();
});

test('double toggle during permission acquisition cancels start without leaking the late microphone', async () => {
  const permission = deferred();
  requestNohmMicStream.mockReturnValue(permission.promise);
  const view = setup();
  act(() => { view.result.current.toggle(); view.result.current.toggle(); });
  permission.resolve(stream);
  await flush();
  expect(requestNohmMicStream).toHaveBeenCalledTimes(1);
  expect(stream.track.stop).toHaveBeenCalledTimes(1);
  expect(sessions).toHaveLength(0);
  expect(view.result.current.active).toBe(false);
});

test('permission refusal returns voice to inactive with a useful error, not fake fallback readiness', async () => {
  requestNohmMicStream.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  const view = setup();
  await start(view);
  expect(view.result.current.active).toBe(false);
  expect(view.result.current.error).toMatch(/access was denied/);
  expect(view.result.current.transport).toBe('');
});

test('provider rejection releases the microphone and does not offer a doomed upload fallback', async () => {
  NohmRealtimeVoiceSession.mockImplementationOnce((options) => {
    const error = new Error("The server's Nohm speech-provider connection was rejected. This is not a user-login error.");
    error.code = 'voice_provider_rejected';
    error.fallbackAvailable = false;
    const session = { options, stop: jest.fn(), start: jest.fn(async () => { throw error; }) };
    sessions.push(session);
    return session;
  });
  const view = setup();
  await start(view);
  expect(view.result.current.active).toBe(false);
  expect(view.result.current.transport).toBe('');
  expect(view.result.current.error).toMatch(/not a user-login error.*Typed map commands remain available/i);
  expect(stream.track.stop).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('captions and queued commands do not reopen a minimized conversation or stop the mic', async () => {
  const onOpen = jest.fn();
  const onPartial = jest.fn();
  const onCommand = jest.fn(async () => 'Map updated');
  const view = setup({ onOpen, onPartial, onCommand });
  await start(view);
  expect(onOpen).toHaveBeenCalledTimes(1);
  for (const partial of ['show', 'show France', 'show France at NUTS3']) {
    act(() => sessions[0].options.onPartialTranscript(partial));
  }
  await transcript('show France at NUTS3');
  await tick();
  expect(onPartial).toHaveBeenCalledWith('show France at NUTS3');
  expect(onCommand).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(view.result.current.active).toBe(true);
  expect(stream.track.stop).not.toHaveBeenCalled();
  act(() => view.result.current.stop());
  expect(stream.track.stop).toHaveBeenCalledTimes(1);
});

test('rapid realtime caption deltas are coalesced and cannot repaint after a final transcript', async () => {
  const onPartial = jest.fn();
  const onCommand = jest.fn(async () => 'Map updated');
  const view = setup({ onPartial, onCommand });
  await start(view);

  act(() => {
    for (let index = 1; index <= 60; index += 1) {
      sessions[0].options.onPartialTranscript(`show France ${index}`);
    }
  });
  expect(onPartial).not.toHaveBeenCalled();
  await tick(39);
  expect(onPartial).not.toHaveBeenCalled();
  await tick(1);
  expect(onPartial).toHaveBeenCalledTimes(1);
  expect(onPartial).toHaveBeenLastCalledWith('show France 60');

  act(() => {
    sessions[0].options.onPartialTranscript('show France at NUTS3');
    sessions[0].options.onTranscript('show France at NUTS3', { mode: 'realtime' });
  });
  await tick(100);
  expect(onCommand).toHaveBeenCalledTimes(1);
  expect(onPartial.mock.calls.filter(([value]) => value === 'show France at NUTS3')).toHaveLength(1);
  expect(onPartial).toHaveBeenLastCalledWith('');
  expect(view.result.current.partial).toBe('');
});

test('stopping voice cancels a queued caption paint', async () => {
  const onPartial = jest.fn();
  const view = setup({ onPartial });
  await start(view);
  act(() => sessions[0].options.onPartialTranscript('late caption'));
  act(() => view.result.current.stop());
  await tick(100);
  expect(onPartial).toHaveBeenCalledTimes(1);
  expect(onPartial).toHaveBeenLastCalledWith('');
  expect(view.result.current.partial).toBe('');
});

test.each(['friends', 'fonts', 'show me friends'])('repairs the observed France STT homophone before queuing %j', async transcriptText => {
  const onCommand = jest.fn(async () => 'Map updated');
  const view = setup({ onCommand });
  await start(view);
  await transcript(transcriptText);
  await tick();
  expect(onCommand).toHaveBeenCalledWith(
    transcriptText.startsWith('show') ? 'show me France' : 'France',
    expect.objectContaining({ source: 'voice' }),
  );
});

test('starts the Nohm transcription session with Atlas model hints', async () => {
  const transcriptionContext = { prompt: 'Atlas geography', keywords: ['France'], delay: 'medium' };
  const view = setup({ transcriptionContext });
  await start(view);
  expect(sessions[0].start).toHaveBeenCalledWith({
    stream,
    assistant: 'emil',
    transcriptionContext,
  });
});

test('a late failure from an old session cannot stop the replacement session', async () => {
  const pending = deferred();
  NohmRealtimeVoiceSession.mockImplementationOnce((options) => {
    const session = { options, start: jest.fn(() => pending.promise), stop: jest.fn() };
    sessions.push(session); return session;
  });
  const view = setup();
  await start(view);
  act(() => view.result.current.stop());
  await start(view);
  const replacement = sessions[1];
  pending.reject(new Error('old handshake failed'));
  await flush();
  expect(replacement.stop).not.toHaveBeenCalled();
  expect(view.result.current.active).toBe(true);
  expect(view.result.current.transport).toBe('realtime');
});

test('Stop cancels a scheduled device restart', async () => {
  const view = setup();
  await start(view);
  act(() => view.result.current.selectMicDevice('usb-mic'));
  act(() => view.result.current.stop());
  await tick(150);
  expect(requestNohmMicStream).toHaveBeenCalledTimes(1);
  expect(view.result.current.active).toBe(false);
});

test('transport failure switches to push-to-talk, but a failed transcript only leaves a draft warning', async () => {
  const onPartial = jest.fn();
  const view = setup({ onPartial });
  await start(view);
  act(() => sessions[0].options.onError(new Error('repeat the caption'), { recoverable: true, draft: 'run the model' }));
  expect(view.result.current.transport).toBe('realtime');
  expect(onPartial).toHaveBeenCalledWith('run the model');
  act(() => sessions[0].options.onError(new Error('connection failed'), { fatal: true }));
  expect(view.result.current.transport).toBe('upload');
  expect(view.result.current.warning).toMatch(/push-to-talk/);
  expect(sessions[0].stop).toHaveBeenCalledTimes(1);
  act(() => view.result.current.stop());
  expect(stream.track.stop).toHaveBeenCalledTimes(1);
});

test('a live transport failure preserves its latest coalesced draft without leaving fallback-ready phase', async () => {
  const onPartial = jest.fn();
  const view = setup({ onPartial });
  await start(view);
  act(() => {
    sessions[0].options.onPartialTranscript('show Spain and');
    sessions[0].options.onPartialTranscript('show Spain and France');
    sessions[0].options.onError(new Error('connection failed'), { fatal: true });
  });
  expect(onPartial).toHaveBeenCalledTimes(1);
  expect(onPartial).toHaveBeenCalledWith('show Spain and France');
  expect(view.result.current.transport).toBe('upload');
  expect(view.result.current.phase).toBe('fallback_ready');
  await tick(100);
  expect(onPartial).toHaveBeenCalledTimes(1);
});

test('queued commands stay ordered and are not submitted while Atlas remains busy beyond two minutes', async () => {
  const onCommand = jest.fn();
  const view = setup({ busy: true, onCommand });
  await start(view);
  await transcript('show Spain');
  await transcript('add France');
  await tick(121000);
  expect(onCommand).not.toHaveBeenCalled();
  view.rerender({ apiBase: '/api/voice', busy: false, onCommand });
  for (let i = 0; i < 7; i += 1) await tick();
  expect(onCommand.mock.calls.map(([text]) => text)).toEqual(['show Spain', 'add France']);
});

test('queue is bounded, preserves an overflow caption, and Clear cancels even the instruction waiting for idle', async () => {
  const onCommand = jest.fn();
  const onPartial = jest.fn();
  const view = setup({ busy: true, onCommand, onPartial });
  await start(view);
  for (let i = 0; i < 12; i += 1) await transcript(`instruction ${i}`);
  expect(view.result.current.queueDepth).toBeLessThanOrEqual(8);
  expect(view.result.current.warning).toMatch(/already queued/);
  expect(onPartial).toHaveBeenLastCalledWith('instruction 11');
  act(() => view.result.current.clearQueue());
  view.rerender({ apiBase: '/api/voice', busy: false, onCommand, onPartial });
  for (let i = 0; i < 5; i += 1) await tick();
  expect(onCommand).not.toHaveBeenCalled();
  expect(view.result.current.queueDepth).toBe(0);
});

test('late TTS blob after interruption is not played', async () => {
  const blob = deferred();
  global.fetch.mockImplementation(async (url) => url.endsWith('/speak')
    ? { ok: true, blob: () => blob.promise }
    : { ok: true, json: async () => ({ ready: true }) });
  const createUrl = jest.fn();
  URL.createObjectURL = createUrl;
  const onCommand = jest.fn(async (_, { onReply }) => onReply('Spain is ready.'));
  const view = setup({ onCommand });
  act(() => view.result.current.setMode('conversation'));
  await start(view);
  await transcript('show Spain');
  await tick(); await tick();
  expect(global.fetch.mock.calls.some(([url]) => url.endsWith('/speak'))).toBe(true);
  act(() => sessions[0].options.onSpeechStart());
  blob.resolve(new Blob(['audio']));
  await flush();
  expect(createUrl).not.toHaveBeenCalled();
});

test.each(['headers', 'audio', 'error'].flatMap(stage => ['interrupt', 'timeout', 'restart'].map(stop => [stage, stop])))
  ('a stalled speech %s does not hold the command queue after %s', async (stage, stop) => {
    const held = deferred();
    const decode = jest.fn(() => held.promise);
    const createUrl = jest.fn();
    URL.createObjectURL = createUrl;
    global.fetch.mockImplementation(() => stage === 'headers' ? held.promise
      : Promise.resolve(stage === 'audio' ? { ok: true, blob: decode } : { ok: false, status: 502, json: decode }));
    const onCommand = jest.fn(async (text, { onReply }) => {
      if (text === 'first') onReply('The first map update is complete.');
    });
    const view = setup({ onCommand });
    act(() => view.result.current.setMode('conversation'));
    await start(view);
    await transcript('first');
    await tick(); await tick();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const signal = global.fetch.mock.calls[0][1].signal;
    if (stop === 'interrupt') act(() => sessions[0].options.onSpeechStart());
    else if (stop === 'restart') { act(() => view.result.current.stop()); await start(view); }
    else await tick(45000);
    await transcript('second');
    await tick(); await tick(); await tick();
    expect(signal.aborted).toBe(true);
    expect(onCommand.mock.calls.map(([text]) => text)).toEqual(['first', 'second']);
    expect(view.result.current.active).toBe(true);
    const lateDecode = jest.fn(async () => new Blob(['late audio']));
    held.resolve(stage === 'headers' ? { ok: true, blob: lateDecode } : new Blob(['late audio']));
    await flush();
    expect(lateDecode).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
  });
