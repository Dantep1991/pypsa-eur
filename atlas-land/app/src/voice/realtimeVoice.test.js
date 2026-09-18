import { NohmRealtimeVoiceSession } from './realtimeVoice';

describe('NohmRealtimeVoiceSession transcription delivery', () => {
  test('delivers one final transcript for each Realtime item id', () => {
    const transcripts = [];
    const session = new NohmRealtimeVoiceSession({
      onTranscript: (text, meta) => transcripts.push({ text, meta }),
    });
    session._handleServerEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'turn-1',
      delta: 'add France',
    }));
    const completed = JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'turn-1',
      transcript: 'add France',
    });
    session._handleServerEvent(completed);
    session._handleServerEvent(completed);
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].text).toBe('add France');
  });

  test('keeps a partial as a draft instead of executing an unfinished instruction', () => {
    const transcripts = [];
    const errors = [];
    const session = new NohmRealtimeVoiceSession({
      onTranscript: (text, meta) => transcripts.push({ text, meta }),
      onError: (error) => errors.push(error),
    });
    session._handleServerEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'turn-2',
      delta: 'run the model around Madrid at 100 kilometres',
    }));
    session._handleServerEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'turn-2',
      error: { message: 'provider timeout' },
    }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Nothing was executed/);
    expect(transcripts).toHaveLength(0);
  });

  test('reports a failure when there is no transcript to recover', () => {
    const errors = [];
    const session = new NohmRealtimeVoiceSession({ onError: (error) => errors.push(error) });
    session._handleServerEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'turn-3',
      error: { message: 'transcription rejected' },
    }));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/transcription rejected/);
  });
});

describe('WebRTC resource lifecycle', () => {
  let peer;
  let listeners;
  let clone;
  let stream;
  beforeEach(() => {
    listeners = {};
    clone = { readyState: 'live', stop: jest.fn() };
    stream = { getAudioTracks: () => [{ readyState: 'live', clone: () => clone }] };
    global.MediaStream = class {
      constructor(tracks) { this.tracks = tracks; }
      getAudioTracks() { return this.tracks; }
      getTracks() { return this.tracks; }
    };
    const dc = { close: jest.fn(), addEventListener: (type, listener) => { listeners[type] = listener; } };
    peer = { connectionState: 'connecting', close: jest.fn(), addTrack: jest.fn(), createDataChannel: () => dc,
      createOffer: jest.fn(async () => ({ sdp: 'offer' })), setLocalDescription: jest.fn(async () => {}),
      setRemoteDescription: jest.fn(async () => {}) };
    window.RTCPeerConnection = jest.fn(() => peer);
    window.AudioContext = jest.fn(() => ({
      state: 'running',
      createAnalyser: () => ({
        fftSize: 512,
        disconnect: jest.fn(),
        getByteTimeDomainData: (samples) => samples.fill(128),
      }),
      createMediaStreamSource: () => ({ connect: jest.fn(), disconnect: jest.fn() }),
      close: jest.fn(async () => {}),
    }));
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => 'answer' }));
  });
  afterEach(() => { delete window.AudioContext; jest.useRealTimers(); });
  const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

  test('does not declare readiness until the data channel opens', async () => {
    const onStatus = jest.fn();
    const session = new NohmRealtimeVoiceSession({ onStatus });
    session._createClientSecret = async () => ({ value: 'ephemeral-test' });
    const started = session.start({ stream });
    await flush();
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(onStatus.mock.calls.map(([phase]) => phase)).toEqual(['connecting']);
    listeners.open();
    await started;
    expect(onStatus.mock.calls.at(-1)[0]).toBe('listening');
    session.stop();
    expect(clone.stop).toHaveBeenCalledTimes(1);
    const statuses = onStatus.mock.calls.length;
    listeners.open();
    expect(onStatus).toHaveBeenCalledTimes(statuses);
  });

  test('a data channel that never opens times out and releases all owned media', async () => {
    jest.useFakeTimers();
    const session = new NohmRealtimeVoiceSession();
    session._createClientSecret = async () => ({ value: 'ephemeral-test' });
    const started = session.start({ stream });
    const rejected = expect(started).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    jest.advanceTimersByTime(25001);
    await rejected;
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(clone.stop).toHaveBeenCalledTimes(1);
    expect(session.closed).toBe(true);
  });

  test('stop cancels even a browser offer promise that never settles', async () => {
    peer.createOffer.mockImplementation(() => new Promise(() => {}));
    const session = new NohmRealtimeVoiceSession();
    session._createClientSecret = async () => ({ value: 'ephemeral-test' });
    const started = session.start({ stream });
    const rejected = expect(started).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    session.stop();
    await rejected;
    expect(clone.stop).toHaveBeenCalledTimes(1);
  });
});

const sendEvent = (session, type, itemId, extra = {}) => session._handleServerEvent(JSON.stringify({ type, item_id: itemId, ...extra }));
const complete = (session, id, transcript) => sendEvent(session, 'conversation.item.input_audio_transcription.completed', id, { transcript });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

describe('ordered voice turns and cancellation', () => {
  afterEach(() => jest.useRealTimers());

  test('executes final transcripts in spoken order, not completion order', () => {
    const onTranscript = jest.fn();
    const session = new NohmRealtimeVoiceSession({ onTranscript });
    sendEvent(session, 'input_audio_buffer.speech_started', 'a');
    sendEvent(session, 'input_audio_buffer.committed', 'a');
    sendEvent(session, 'input_audio_buffer.speech_started', 'b');
    sendEvent(session, 'input_audio_buffer.committed', 'b', { previous_item_id: 'a' });
    complete(session, 'b', 'add generation');
    expect(onTranscript).not.toHaveBeenCalled();
    complete(session, 'a', 'show Spain');
    expect(onTranscript.mock.calls.map(([text]) => text)).toEqual(['show Spain', 'add generation']);
    session.stop();
  });

  test('a later utterance does not cancel the earlier turn deadline', () => {
    jest.useFakeTimers();
    const onTranscript = jest.fn();
    const onError = jest.fn();
    const session = new NohmRealtimeVoiceSession({ onTranscript, onError, completionTimeoutMs: 500 });
    sendEvent(session, 'input_audio_buffer.speech_stopped', 'a');
    sendEvent(session, 'conversation.item.input_audio_transcription.delta', 'a', { delta: 'run the model' });
    sendEvent(session, 'input_audio_buffer.speech_started', 'b');
    complete(session, 'b', 'zoom out');
    jest.advanceTimersByTime(501);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1].draft).toBe('run the model');
    expect(onTranscript.mock.calls.map(([text]) => text)).toEqual(['zoom out']);
    complete(session, 'a', 'run the model, no cancel that');
    expect(onTranscript).toHaveBeenCalledTimes(1);
    session.stop();
  });

  test('empty final does not substitute a misleading partial; word spacing is preserved', () => {
    const onTranscript = jest.fn();
    const onPartialTranscript = jest.fn();
    const session = new NohmRealtimeVoiceSession({ onTranscript, onPartialTranscript });
    sendEvent(session, 'conversation.item.input_audio_transcription.delta', 'a', { delta: 'show ' });
    sendEvent(session, 'conversation.item.input_audio_transcription.delta', 'a', { delta: 'Spain' });
    expect(onPartialTranscript.mock.calls.at(-1)[0]).toBe('show Spain');
    complete(session, 'a', '');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  test('stop releases turn timers and ignores late transcript/error events', () => {
    jest.useFakeTimers();
    const onTranscript = jest.fn();
    const onError = jest.fn();
    const session = new NohmRealtimeVoiceSession({ onTranscript, onError });
    sendEvent(session, 'input_audio_buffer.speech_stopped', 'a');
    session.stop();
    complete(session, 'a', 'add France');
    sendEvent(session, 'error', '', { error: { message: 'late failure' } });
    jest.runAllTimers();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(session.turns.size).toBe(0);
  });

  test('stopping while token creation is pending cannot create a late peer', async () => {
    const token = deferred();
    const pc = jest.fn();
    window.RTCPeerConnection = pc;
    const session = new NohmRealtimeVoiceSession();
    session._createClientSecret = jest.fn(() => token.promise);
    const started = session.start({ stream: { getAudioTracks: () => [{ readyState: 'live' }] } });
    const rejected = expect(started).rejects.toMatchObject({ name: 'AbortError' });
    session.stop();
    token.resolve({ value: 'test-ephemeral' });
    await rejected;
    expect(pc).not.toHaveBeenCalled();
    expect(session._createClientSecret.mock.calls[0][2].aborted).toBe(true);
  });

  test('stops cloned input and gain-output tracks without stopping the callers mic', () => {
    const sourceTrack = { stop: jest.fn() };
    const outputTrack = { stop: jest.fn() };
    const session = new NohmRealtimeVoiceSession();
    session.cloneStream = { getTracks: () => [sourceTrack] };
    session.outboundStream = { getTracks: () => [outputTrack] };
    session.stop();
    session.stop();
    expect(sourceTrack.stop).toHaveBeenCalledTimes(1);
    expect(outputTrack.stop).toHaveBeenCalledTimes(1);
  });
});

test('requests Nohm dedicated transcription mode with bounded app-provided model hints', async () => {
  const session = new NohmRealtimeVoiceSession({ apiBase: '/api/nohm/voice' });
  const signal = new AbortController().signal;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ value: 'token' }) }));
  await session._createClientSecret('emil', {
    language: '',
    prompt: 'A Nohm Atlas map command.',
    keywords: ['France', 'NUTS3'],
    delay: 'medium',
  }, signal);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('/api/nohm/voice/realtime/client-secret');
  expect(JSON.parse(options.body)).toEqual({
    assistant: 'emil',
    mode: 'transcription',
    language: '',
    prompt: 'A Nohm Atlas map command.',
    keywords: ['France', 'NUTS3'],
    delay: 'medium',
  });
});

test('preserves provider fallback guidance from a rejected voice token request', async () => {
  const session = new NohmRealtimeVoiceSession({ apiBase: '/api/voice' });
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 502,
    json: async () => ({
      error: "The server's Nohm speech-provider connection was rejected. This is not a user-login error.",
      code: 'voice_provider_rejected',
      fallback_available: false,
      retryable: false,
    }),
  }));
  await expect(session._createClientSecret('emil', {}, new AbortController().signal)).rejects.toMatchObject({
    code: 'voice_provider_rejected',
    fallbackAvailable: false,
    retryable: false,
  });
});

test('local pause detection commits one completed speech turn', () => {
  const onSpeechStop = jest.fn();
  const onStatus = jest.fn();
  const session = new NohmRealtimeVoiceSession({ onSpeechStop, onStatus });
  session.closed = false;
  session.localSpeechActive = true;
  session.dc = { readyState: 'open', send: jest.fn() };
  expect(session._commitInputAudio()).toBe(true);
  expect(JSON.parse(session.dc.send.mock.calls[0][0])).toEqual({ type: 'input_audio_buffer.commit' });
  expect(onSpeechStop).toHaveBeenCalledTimes(1);
  expect(onStatus).toHaveBeenLastCalledWith('transcribing', expect.objectContaining({ local_vad: true }));
  expect(session._commitInputAudio()).toBe(false);
});
