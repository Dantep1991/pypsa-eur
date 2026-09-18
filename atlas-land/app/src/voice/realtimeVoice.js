import { waitForVoiceStep } from './waitForVoiceStep';

const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const COMPLETION_TIMEOUT_MS = 15000;
const MAX_PENDING_TURNS = 32;
const LOCAL_SILENCE_RMS_THRESHOLD = 0.018;
const LOCAL_SILENCE_COMMIT_MS = 750;
const LOCAL_MAX_TURN_MS = 20000;
const LOCAL_AUDIO_POLL_MS = 80;

function stableNow() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function cancelled() {
  return new DOMException('Voice session was stopped.', 'AbortError');
}

export class NohmRealtimeVoiceSession {
  constructor({ apiBase, inputGain = 1, onStatus = () => {}, onSpeechStart = () => {},
    onSpeechStop = () => {}, onPartialTranscript = () => {}, onTranscript = () => {},
    onError = () => {}, onClose = () => {}, completionTimeoutMs = COMPLETION_TIMEOUT_MS,
  } = {}) {
    Object.assign(this, { inputGain, onStatus, onSpeechStart, onSpeechStop,
      onPartialTranscript, onTranscript, onError, onClose });
    this.apiBase = String(apiBase || '').replace(/\/$/, '');
    this.completionTimeoutMs = Math.max(250, Number(completionTimeoutMs) || COMPLETION_TIMEOUT_MS);
    this.pc = null;
    this.dc = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.destinationNode = null;
    this.detectorSourceNode = null;
    this.detectorAnalyserNode = null;
    this.cloneStream = null;
    this.outboundStream = null;
    this.sessionInfo = null;
    this.turns = new Map();
    this.turnOrder = [];
    this.finalizedItemIds = new Set();
    this.generation = 0;
    this.startController = null;
    this.disconnectTimer = null;
    this.commitTimer = null;
    this.localSpeechActive = false;
    this.localSpeechStartedAt = 0;
    this.localLastVoiceAt = 0;
    this.startedAt = 0;
    this.closed = false;
  }

  async start({ stream, assistant = 'emil', transcriptionContext = {} } = {}) {
    if (typeof window === 'undefined' || !window.RTCPeerConnection) {
      throw new Error('Live voice requires browser WebRTC support.');
    }
    if (!stream?.getAudioTracks?.().some((track) => track.readyState === 'live')) {
      throw new Error('Live voice requires an active microphone.');
    }
    this.stop();
    this.closed = false;
    const generation = this.generation;
    const controller = new AbortController();
    this.startController = controller;
    const isActive = () => !this.closed && generation === this.generation;
    const assertActive = () => {
      if (!isActive() || controller.signal.aborted) throw cancelled();
    };
    // Bound token and SDP setup so a failed service cannot leave voice connecting.
    const timer = setTimeout(() => controller.abort(), 25000);
    this.startedAt = stableNow();
    this.onStatus('connecting');
    try {
      const wait = (promise) => waitForVoiceStep(promise, controller.signal);
      const tokenPayload = await wait(this._createClientSecret(assistant, transcriptionContext, controller.signal));
      assertActive();
      const token = tokenPayload?.value || tokenPayload?.client_secret?.value;
      if (!token) throw new Error('The voice service did not return a Realtime token.');
      this.sessionInfo = tokenPayload;
      const pc = new window.RTCPeerConnection();
      this.pc = pc;
      pc.onconnectionstatechange = () => {
        if (!isActive()) return;
        clearTimeout(this.disconnectTimer);
        if (pc.connectionState === 'connected' && this.dc?.readyState === 'open') this.onStatus('listening', this._meta({ connected: true }));
        if (pc.connectionState === 'failed') this.onError(new Error('Live voice connection failed.'), this._meta({ fatal: true }));
        if (pc.connectionState === 'disconnected') {
          this.onStatus('reconnecting');
          this.disconnectTimer = setTimeout(() => {
            if (isActive() && pc.connectionState === 'disconnected') {
              this.onError(new Error('Live voice disconnected.'), this._meta({ fatal: true }));
            }
          }, 3000);
        }
        if (pc.connectionState === 'closed') this.onClose(this._meta());
      };
      this.outboundStream = this._buildOutboundStream(stream);
      this.outboundStream.getAudioTracks().forEach((track) => pc.addTrack(track, this.outboundStream));
      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      let channelOpened;
      const channelReady = new Promise((resolve) => { channelOpened = resolve; });
      dc.addEventListener('open', () => {
        if (isActive()) {
          const detectorReady = this._startLocalTurnDetection();
          if (!detectorReady || !isActive()) { channelOpened(); return; }
          this.onStatus('listening', this._meta());
          channelOpened();
        }
      });
      dc.addEventListener('message', (event) => { if (isActive()) this._handleServerEvent(event.data); });
      dc.addEventListener('error', () => {
        if (isActive()) this.onError(new Error('Live voice data channel failed.'), this._meta({ fatal: true }));
      });
      dc.addEventListener('close', () => { if (isActive()) this.onClose(this._meta()); });
      const offer = await wait(pc.createOffer());
      assertActive();
      await wait(pc.setLocalDescription(offer));
      assertActive();
      const response = await wait(fetch(OPENAI_REALTIME_CALLS_URL, {
        method: 'POST', body: offer.sdp, signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
      }));
      assertActive();
      if (!response.ok) throw new Error(`Realtime connection failed (${response.status}).`);
      const sdp = await wait(response.text());
      assertActive();
      await wait(pc.setRemoteDescription({ type: 'answer', sdp }));
      await wait(channelReady);
      assertActive();
      return tokenPayload;
    } catch (error) {
      // An old cancelled start must not tear down a newer session.
      if (isActive()) this.stop();
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.startController === controller) this.startController = null;
    }
  }

  stop() {
    this.closed = true;
    this.generation += 1;
    this.startController?.abort();
    this.startController = null;
    clearTimeout(this.disconnectTimer);
    this.disconnectTimer = null;
    clearInterval(this.commitTimer);
    this.commitTimer = null;
    try { this.dc?.close?.(); } catch (_) {}
    try { this.pc?.close?.(); } catch (_) {}
    // Release both gain-source clones and destination tracks, not the caller's mic.
    const tracks = new Set([
      ...(this.outboundStream?.getTracks?.() || []), ...(this.cloneStream?.getTracks?.() || []),
    ]);
    tracks.forEach((track) => { try { track.stop(); } catch (_) {} });
    for (const node of [this.sourceNode, this.gainNode, this.destinationNode, this.detectorSourceNode, this.detectorAnalyserNode]) {
      try { node?.disconnect?.(); } catch (_) {}
    }
    try { this.audioContext?.close?.()?.catch?.(() => {}); } catch (_) {}
    this.pc = this.dc = this.audioContext = this.sourceNode = this.gainNode = this.destinationNode = null;
    this.detectorSourceNode = this.detectorAnalyserNode = null;
    this.cloneStream = this.outboundStream = this.sessionInfo = null;
    this.localSpeechActive = false;
    this.localSpeechStartedAt = 0;
    this.localLastVoiceAt = 0;
    this.turns.forEach((turn) => clearTimeout(turn.timer));
    this.turns.clear();
    this.turnOrder = [];
    this.finalizedItemIds.clear();
  }

  async _createClientSecret(assistant, transcriptionContext, signal) {
    const context = transcriptionContext && typeof transcriptionContext === 'object'
      ? transcriptionContext
      : {};
    const response = await fetch(`${this.apiBase}/realtime/client-secret`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({
        assistant,
        mode: 'transcription',
        language: String(context.language || ''),
        prompt: String(context.prompt || ''),
        keywords: Array.isArray(context.keywords) ? context.keywords : [],
        delay: String(context.delay || 'medium'),
      }), signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.detail || `Voice token request failed (${response.status}).`);
      error.code = String(payload?.code || 'voice_token_failed');
      error.fallbackAvailable = payload?.fallback_available !== false;
      error.retryable = payload?.retryable !== false;
      throw error;
    }
    return payload;
  }

  _buildOutboundStream(stream) {
    this.cloneStream = new MediaStream(stream.getAudioTracks().map((track) => track.clone()));
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor || !Number.isFinite(Number(this.inputGain)) || Number(this.inputGain) === 1) return this.cloneStream;
    this.audioContext = new AudioContextCtor();
    if (this.audioContext.state === 'suspended') void this.audioContext.resume().catch(() => {});
    this.sourceNode = this.audioContext.createMediaStreamSource(this.cloneStream);
    this.gainNode = this.audioContext.createGain();
    this.destinationNode = this.audioContext.createMediaStreamDestination();
    this.gainNode.gain.setValueAtTime(Number(this.inputGain), this.audioContext.currentTime || 0);
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.destinationNode);
    return this.destinationNode.stream;
  }

  _startLocalTurnDetection() {
    clearInterval(this.commitTimer);
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor || !this.outboundStream) {
      this.onError(new Error('Live pause detection is unavailable in this browser.'), this._meta({ fatal: true }));
      return false;
    }
    try {
      if (!this.audioContext) this.audioContext = new AudioContextCtor();
      if (this.audioContext.state === 'suspended') void this.audioContext.resume().catch(() => {});
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 512;
      const detectorSource = this.audioContext.createMediaStreamSource(this.outboundStream);
      detectorSource.connect(analyser);
      // Include these nodes in the existing teardown path.
      this.detectorSourceNode = detectorSource;
      this.detectorAnalyserNode = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      this.commitTimer = setInterval(() => {
        if (this.closed) return;
        analyser.getByteTimeDomainData(samples);
        let squares = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          squares += normalized * normalized;
        }
        const rms = Math.sqrt(squares / samples.length);
        const now = Date.now();
        if (rms >= LOCAL_SILENCE_RMS_THRESHOLD) {
          if (!this.localSpeechActive) {
            this.localSpeechActive = true;
            this.localSpeechStartedAt = now;
            this.onSpeechStart(this._meta({ local_vad: true }));
            this.onStatus('hearing', this._meta({ local_vad: true }));
          }
          this.localLastVoiceAt = now;
          if (now - this.localSpeechStartedAt >= LOCAL_MAX_TURN_MS) this._commitInputAudio();
          return;
        }
        if (!this.localSpeechActive) return;
        if (now - this.localLastVoiceAt >= LOCAL_SILENCE_COMMIT_MS) this._commitInputAudio();
      }, LOCAL_AUDIO_POLL_MS);
      return true;
    } catch (_) {
      this.onError(new Error('Live pause detection could not start.'), this._meta({ fatal: true }));
      return false;
    }
  }

  _commitInputAudio() {
    if (!this.localSpeechActive || this.dc?.readyState !== 'open') return false;
    try {
      this.dc.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      this.localSpeechActive = false;
      this.localSpeechStartedAt = 0;
      this.localLastVoiceAt = 0;
      this.onSpeechStop(this._meta({ local_vad: true }));
      this.onStatus('transcribing', this._meta({ local_vad: true }));
      return true;
    } catch (_) {
      return false;
    }
  }

  _turn(itemId, previousId) {
    if (!itemId || this.finalizedItemIds.has(itemId)) return null;
    if (!this.turns.has(itemId)) {
      if (this.turns.size >= MAX_PENDING_TURNS) {
        this.onError(new Error('Too many unfinished voice turns. Please reconnect and repeat your last request.'), this._meta({ fatal: true }));
        return null;
      }
      this.turns.set(itemId, { partial: '', startedAt: stableNow(), done: false, timer: null });
      this.turnOrder.push(itemId);
    }
    // Commits arrive in speech order; transcript finals may finish out of order.
    if (previousId && previousId !== itemId && this.turns.has(previousId)) {
      this.turnOrder = this.turnOrder.filter((id) => id !== itemId);
      this.turnOrder.splice(this.turnOrder.indexOf(previousId) + 1, 0, itemId);
    }
    return this.turns.get(itemId);
  }

  _waitForFinal(itemId) {
    const turn = this.turns.get(itemId);
    if (!turn || turn.done || turn.timer) return;
    turn.timer = setTimeout(() => this._failTurn(itemId, 'The final transcript did not arrive.'), this.completionTimeoutMs);
  }

  _failTurn(itemId, message) {
    const turn = this.turns.get(itemId);
    if (!turn || turn.done || this.closed) return;
    clearTimeout(turn.timer);
    turn.done = true;
    // Partials are captions, never instructions: later speech can negate them.
    this.onError(new Error(`${message} Nothing was executed for this turn; please repeat it or send the caption.`),
      this._meta({ item_id: itemId, recoverable: true, draft: turn.partial }));
    this._flushFinals();
  }

  _flushFinals() {
    while (this.turnOrder.length && this.turns.get(this.turnOrder[0])?.done) {
      const itemId = this.turnOrder.shift();
      const turn = this.turns.get(itemId);
      this.turns.delete(itemId);
      this.finalizedItemIds.add(itemId);
      if (this.finalizedItemIds.size > 100) this.finalizedItemIds.delete(this.finalizedItemIds.values().next().value);
      if (turn.transcript) this.onTranscript(turn.transcript, this._meta({ item_id: itemId, partial: false,
        stt_ms: Math.max(0, Math.round(stableNow() - turn.startedAt)) }));
    }
  }

  _handleServerEvent(rawData) {
    if (this.closed) return;
    let event;
    try { event = JSON.parse(rawData); } catch (_) { return; }
    if (!event?.type) return;
    if (event.type === 'error') {
      this.onError(new Error(event?.error?.message || 'Realtime voice server error.'), this._meta({ fatal: true }));
      return;
    }
    if (!['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped', 'input_audio_buffer.committed',
      'conversation.item.input_audio_transcription.delta', 'conversation.item.input_audio_transcription.completed',
      'conversation.item.input_audio_transcription.failed'].includes(event.type)) return;
    const itemId = event.item_id;
    const turn = this._turn(itemId, event.previous_item_id);
    if (!turn || turn.done) return;
    if (event.type === 'input_audio_buffer.speech_started') {
      this.onSpeechStart(this._meta({ item_id: itemId }));
      this.onStatus('hearing', this._meta());
    } else if (event.type === 'input_audio_buffer.speech_stopped') {
      this._waitForFinal(itemId);
      this.onSpeechStop(this._meta({ item_id: itemId }));
      this.onStatus('transcribing', this._meta());
    } else if (event.type === 'input_audio_buffer.committed') {
      this._waitForFinal(itemId);
    } else if (event.type === 'conversation.item.input_audio_transcription.delta') {
      turn.partial += String(event.delta || '');
      if (turn.partial.trim()) this.onPartialTranscript(turn.partial.trim(), this._meta({ item_id: itemId, partial: true }));
    } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
      clearTimeout(turn.timer);
      turn.transcript = String(event.transcript || '').trim();
      turn.done = true;
      this._flushFinals();
    } else if (event.type === 'conversation.item.input_audio_transcription.failed') {
      this._failTurn(itemId, event?.error?.message || 'Realtime transcription failed.');
    }
  }

  _meta(extra = {}) {
    return { mode: 'realtime', stt_provider: 'openai-realtime',
      stt_model: this.sessionInfo?.transcription_model, realtime_model: this.sessionInfo?.model,
      realtime_session_id: this.sessionInfo?.session?.id, ...extra };
  }
}
