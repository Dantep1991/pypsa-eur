import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  extensionForMimeType,
  microphoneErrorMessage,
  NOHM_VOICE_INPUT_DEVICE_STORAGE_KEY,
  preferredNohmVoiceMimeType,
  requestNohmMicStream,
  safeLocalStorageGet,
  safeLocalStorageSet,
  stopMediaStream,
} from '../voice/browserVoiceCapture';
import { NohmRealtimeVoiceSession } from '../voice/realtimeVoice';
import { waitForVoiceStep } from '../voice/waitForVoiceStep';
import { createAudioLevelStore } from '../voice/audioLevelStore';
import { normalizeAtlasVoiceTranscript } from '../voice/atlasTranscriptionContext';
import {
  EMIL_VOICE_MODES,
  emilVoiceReducer,
  emilVoiceStatusLabel,
  INITIAL_EMIL_VOICE_STATE,
  selectSpokenReply,
} from '../voice/emilVoiceState';

const MODE_STORAGE_KEY = 'nohm.atlas.emilVoiceMode';
const MIN_AUDIO_BYTES = 256;
const MAX_QUEUED_COMMANDS = 8;
const MAX_RECORDING_MS = 60000;
const PARTIAL_CAPTION_INTERVAL_MS = 40;

function initialState() {
  const storedMode = safeLocalStorageGet(MODE_STORAGE_KEY);
  return {
    ...INITIAL_EMIL_VOICE_STATE,
    mode: storedMode === EMIL_VOICE_MODES.CONVERSATION
      ? EMIL_VOICE_MODES.CONVERSATION
      : EMIL_VOICE_MODES.COMMANDS,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function useEmilVoice({ apiBase, busy, onCommand, onPartial, onOpen, transcriptionContext }) {
  const [state, dispatch] = useReducer(emilVoiceReducer, undefined, initialState);
  const micLevelStoreRef = useRef(null);
  if (!micLevelStoreRef.current) micLevelStoreRef.current = createAudioLevelStore();
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState(() => (
    safeLocalStorageGet(NOHM_VOICE_INPUT_DEVICE_STORAGE_KEY)
  ));

  const stateRef = useRef(state);
  const busyRef = useRef(busy);
  const onCommandRef = useRef(onCommand);
  const onPartialRef = useRef(onPartial);
  const onOpenRef = useRef(onOpen);
  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const commandQueueRef = useRef([]);
  const queueVersionRef = useRef(0);
  const processingRef = useRef(false);
  const speechAudioRef = useRef(null);
  const speechAbortRef = useRef(null);
  const speechResolveRef = useRef(null);
  const speechUrlRef = useRef('');
  const meterRef = useRef({ context: null, source: null, frame: 0, lastPaint: 0 });
  const mountedRef = useRef(true);
  const epochRef = useRef(0);
  const activeRef = useRef(false);
  const restartTimerRef = useRef(null);
  const fallbackStartingRef = useRef(false);
  const recordingTimerRef = useRef(null);
  const transcriptionsRef = useRef(new Set());
  const partialCaptionRef = useRef({ timer: null, text: '', epoch: 0 });

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { onPartialRef.current = onPartial; }, [onPartial]);
  useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);

  const publishPartialCaption = useCallback((text, epoch) => {
    if (!mountedRef.current || !activeRef.current || epoch !== epochRef.current) return;
    onPartialRef.current?.(text);
    dispatch({ type: 'partial', epoch, text });
  }, []);

  const cancelPendingPartialCaption = useCallback(() => {
    const pending = partialCaptionRef.current;
    if (pending.timer != null) window.clearTimeout(pending.timer);
    partialCaptionRef.current = { timer: null, text: '', epoch: epochRef.current };
  }, []);

  const flushPendingPartialCaption = useCallback(() => {
    const pending = partialCaptionRef.current;
    if (pending.timer != null) window.clearTimeout(pending.timer);
    partialCaptionRef.current = { timer: null, text: '', epoch: pending.epoch };
    if (pending.text) publishPartialCaption(pending.text, pending.epoch);
  }, [publishPartialCaption]);

  const schedulePartialCaption = useCallback((text, epoch) => {
    const normalized = String(text || '');
    const pending = partialCaptionRef.current;
    pending.text = normalized;
    pending.epoch = epoch;
    if (pending.timer != null) return;
    pending.timer = window.setTimeout(() => {
      partialCaptionRef.current.timer = null;
      const latest = partialCaptionRef.current;
      partialCaptionRef.current = { timer: null, text: '', epoch: latest.epoch };
      if (latest.text) publishPartialCaption(latest.text, latest.epoch);
    }, PARTIAL_CAPTION_INTERVAL_MS);
  }, [publishPartialCaption]);

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    if (meter.frame) cancelAnimationFrame(meter.frame);
    try { meter.source?.disconnect?.(); } catch (_) {}
    try { meter.context?.close?.(); } catch (_) {}
    meterRef.current = { context: null, source: null, frame: 0, lastPaint: 0 };
    micLevelStoreRef.current.publish(0);
  }, []);

  const startMeter = useCallback(async (stream) => {
    stopMeter();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const meter = { context, source: null, frame: 0, lastPaint: 0 };
    meterRef.current = meter;
    if (context.state === 'suspended') await context.resume().catch(() => {});
    if (meterRef.current !== meter || !activeRef.current) {
      void context.close().catch(() => {});
      return;
    }
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    meter.source = source;
    const paint = (timestamp) => {
      if (meterRef.current !== meter) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      if (timestamp - meter.lastPaint > 80) {
        meter.lastPaint = timestamp;
        const rms = Math.sqrt(sum / samples.length);
        micLevelStoreRef.current.publish(rms * 460);
      }
      meter.frame = requestAnimationFrame(paint);
    };
    meter.frame = requestAnimationFrame(paint);
  }, [stopMeter]);

  const enumerateMics = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    if (!mountedRef.current) return;
    setMicDevices(devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Microphone ${index + 1}` })));
  }, []);

  const clearSpeech = useCallback(({ interrupted = false } = {}) => {
    speechAbortRef.current?.abort?.();
    speechAbortRef.current = null;
    const audio = speechAudioRef.current;
    if (audio) {
      try { audio.pause(); audio.src = ''; } catch (_) {}
    }
    speechAudioRef.current = null;
    if (speechUrlRef.current) URL.revokeObjectURL(speechUrlRef.current);
    speechUrlRef.current = '';
    speechResolveRef.current?.();
    speechResolveRef.current = null;
    if (interrupted && activeRef.current) {
      const epoch = epochRef.current;
      dispatch({ type: 'interrupted', epoch: epochRef.current });
      window.setTimeout(() => {
        if (mountedRef.current && activeRef.current && epoch === epochRef.current) {
          dispatch({ type: 'listening', epoch: epochRef.current, queueDepth: commandQueueRef.current.length });
        }
      }, 90);
    }
  }, []);

  const speak = useCallback(async (text, epoch) => {
    const spoken = String(text || '').replace(/[•\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!spoken || !activeRef.current || epoch !== epochRef.current) return;
    clearSpeech();
    dispatch({ type: 'speaking', epoch, queueDepth: commandQueueRef.current.length });
    const controller = new AbortController();
    speechAbortRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 45000);
    let audio = null;
    let url = '';
    try {
      const response = await waitForVoiceStep(() => fetch(`${apiBase}/speak`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken, assistant: 'emil' }),
        signal: controller.signal,
      }), controller.signal);
      if (!response.ok) {
        const payload = await waitForVoiceStep(() => response.json().catch(() => ({})), controller.signal);
        throw new Error(payload?.error || `Speech output failed (${response.status}).`);
      }
      const blob = await waitForVoiceStep(() => response.blob(), controller.signal);
      if (controller.signal.aborted || epoch !== epochRef.current || !activeRef.current) return;
      url = URL.createObjectURL(blob);
      speechUrlRef.current = url;
      audio = new Audio(url);
      speechAudioRef.current = audio;
      await new Promise((resolve, reject) => {
        speechResolveRef.current = resolve;
        controller.signal.addEventListener('abort', resolve, { once: true });
        audio.onended = resolve;
        audio.onerror = () => reject(new Error('EMIL speech playback failed.'));
        audio.play().catch(reject);
      });
    } catch (error) {
      if (!controller.signal.aborted && error?.name !== 'AbortError' && mountedRef.current) {
        dispatch({ type: 'warning', epoch, message: `${microphoneErrorMessage(error)} Captions remain available.` });
      }
    } finally {
      clearTimeout(timeout);
      if (timedOut && mountedRef.current && activeRef.current && epoch === epochRef.current) {
        dispatch({ type: 'warning', epoch, message: 'Speech playback timed out. The full reply is available in the conversation.' });
      }
      // Cleanup belongs to this playback, never a newer session's audio.
      const ownsPlayback = speechAbortRef.current === controller;
      if (ownsPlayback) {
        speechAbortRef.current = null;
        speechResolveRef.current = null;
      }
      if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.src = ''; }
      if (speechAudioRef.current === audio) speechAudioRef.current = null;
      if (url) URL.revokeObjectURL(url);
      if (speechUrlRef.current === url) speechUrlRef.current = '';
      if (ownsPlayback && mountedRef.current && activeRef.current && epoch === epochRef.current) {
        dispatch({ type: 'listening', epoch, queueDepth: commandQueueRef.current.length });
      }
    }
  }, [apiBase, clearSpeech]);

  const waitUntilAtlasIdle = useCallback(async (epoch, version) => {
    // Do not send queued instructions into a still-busy dispatcher, which
    // would silently drop them. Stop cancels the wait through the epoch.
    while (busyRef.current && activeRef.current && epoch === epochRef.current && version === queueVersionRef.current) await delay(100);
    await delay(60);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (commandQueueRef.current.length) {
        const turn = commandQueueRef.current.shift();
        if (!turn || turn.epoch !== epochRef.current || !activeRef.current) continue;
        await waitUntilAtlasIdle(turn.epoch, turn.queueVersion);
        if (turn.epoch !== epochRef.current || !activeRef.current || turn.queueVersion !== queueVersionRef.current) continue;
        dispatch({ type: 'executing', epoch: turn.epoch, queueDepth: commandQueueRef.current.length + 1 });
        const replies = [];
        try {
          await onCommandRef.current?.(turn.text, {
            source: 'voice',
            voiceMode: turn.mode,
            onReply: (reply) => replies.push(reply),
          });
        } catch (error) {
          replies.push(`I could not complete that request. ${microphoneErrorMessage(error)}`);
        }
        await delay(80);
        if (turn.epoch !== epochRef.current || !activeRef.current) continue;
        const spokenReply = selectSpokenReply(replies);
        if (stateRef.current.mode === EMIL_VOICE_MODES.CONVERSATION && spokenReply) {
          await speak(spokenReply, turn.epoch);
        } else {
          dispatch({ type: 'listening', epoch: turn.epoch, queueDepth: commandQueueRef.current.length });
        }
      }
    } finally {
      processingRef.current = false;
      if (mountedRef.current && activeRef.current && !commandQueueRef.current.length) {
        dispatch({ type: 'listening', epoch: epochRef.current, queueDepth: 0 });
      }
    }
  }, [speak, waitUntilAtlasIdle]);

  const enqueueTranscript = useCallback((value, meta = {}) => {
    const text = normalizeAtlasVoiceTranscript(value);
    const epoch = epochRef.current;
    if (!text || !activeRef.current) return;
    // Deliver at most one last caption before clearing it for the committed
    // instruction. This prevents a delayed partial timer from repainting stale
    // text after the final transcript has already started executing.
    flushPendingPartialCaption();
    if (commandQueueRef.current.length >= MAX_QUEUED_COMMANDS) {
      onPartialRef.current?.(text);
      dispatch({ type: 'warning', epoch, message: 'Eight instructions are already queued. This caption has not been queued; wait or clear the queue before sending it.' });
      return;
    }
    onPartialRef.current?.('');
    const turn = { text, epoch, mode: stateRef.current.mode, meta, queueVersion: queueVersionRef.current };
    commandQueueRef.current.push(turn);
    dispatch({
      type: 'enqueue',
      epoch,
      text,
      queueDepth: commandQueueRef.current.length,
      executing: processingRef.current,
    });
    void processQueue();
  }, [flushPendingPartialCaption, processQueue]);

  const transcribeFallbackBlob = useCallback(async (blob, epoch) => {
    if (epoch !== epochRef.current || !activeRef.current) return;
    if (!blob?.size || blob.size < MIN_AUDIO_BYTES) {
      dispatch({ type: 'warning', epoch, message: 'No speech was captured. Tap the microphone and try again.' });
      dispatch({ type: 'listening', epoch, queueDepth: commandQueueRef.current.length });
      return;
    }
    dispatch({ type: 'transcribing', epoch });
    const formData = new FormData();
    formData.append('file', blob, `atlas-emil.${extensionForMimeType(blob.type)}`);
    formData.append('mode', 'assistant');
    // Keep push-to-talk transcription vocabulary-equivalent to the Realtime
    // transport. Without this context, place names such as France can regress
    // to ordinary homophones ("friends" / "fonts") after a WebRTC fallback.
    const context = transcriptionContext && typeof transcriptionContext === 'object'
      ? transcriptionContext
      : {};
    formData.append('language', String(context.language || ''));
    formData.append('prompt', String(context.prompt || '').slice(0, 1000));
    formData.append('keywords', JSON.stringify(
      (Array.isArray(context.keywords) ? context.keywords : []).slice(0, 100),
    ));
    const controller = new AbortController();
    transcriptionsRef.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const response = await waitForVoiceStep(() => fetch(`${apiBase}/transcribe`, {
        method: 'POST', credentials: 'include', body: formData, signal: controller.signal,
      }), controller.signal);
      const payload = await waitForVoiceStep(() => response.json().catch(() => ({})), controller.signal);
      if (epoch !== epochRef.current || !activeRef.current) return;
      if (!response.ok) throw new Error(payload?.error || `Transcription failed (${response.status}).`);
      if (!String(payload?.text || '').trim()) throw new Error('No speech was recognised.');
      enqueueTranscript(payload.text, { mode: 'upload', stt_ms: payload.elapsed_ms });
    } catch (error) {
      if (activeRef.current && epoch === epochRef.current) dispatch({ type: 'error', epoch,
        message: controller.signal.aborted ? 'Transcription timed out. Please record your command again.' : microphoneErrorMessage(error), recoverable: true });
    } finally {
      clearTimeout(timeout);
      transcriptionsRef.current.delete(controller);
    }
  }, [apiBase, enqueueTranscript, transcriptionContext]);

  const startFallbackRecording = useCallback(async (streamOverride = null) => {
    const epoch = epochRef.current;
    if (!activeRef.current || recorderRef.current || fallbackStartingRef.current || transcriptionsRef.current.size) return;
    fallbackStartingRef.current = true;
    try {
      let stream = streamOverride || streamRef.current;
      if (!stream?.getAudioTracks?.().some((track) => track.readyState === 'live')) {
        stream = await requestNohmMicStream(selectedMicDeviceId);
        if (epoch !== epochRef.current || !activeRef.current) { stopMediaStream(stream); return; }
        streamRef.current = stream;
        await startMeter(stream);
        await enumerateMics();
      }
      if (epoch !== epochRef.current || !activeRef.current) return;
      if (!window.MediaRecorder) throw new Error('This browser cannot record microphone audio.');
      const mimeType = preferredNohmVoiceMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        clearTimeout(recordingTimerRef.current);
        if (recorderRef.current === recorder) recorderRef.current = null;
        dispatch({ type: 'error', epoch, message: microphoneErrorMessage(event?.error), recoverable: true });
      };
      recorder.onstop = () => {
        clearTimeout(recordingTimerRef.current);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
        if (recorderRef.current === recorder) recorderRef.current = null;
        void transcribeFallbackBlob(blob, epoch);
      };
      recorder.start();
      recordingTimerRef.current = setTimeout(() => {
        if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
      }, MAX_RECORDING_MS);
      dispatch({ type: 'fallback', epoch, recording: true, warning: stateRef.current.warning });
    } catch (error) {
      dispatch({ type: 'error', epoch, message: microphoneErrorMessage(error), recoverable: true });
    } finally {
      if (epoch === epochRef.current) fallbackStartingRef.current = false;
    }
  }, [enumerateMics, selectedMicDeviceId, startMeter, transcribeFallbackBlob]);

  const stopFallbackRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    try { recorder.stop(); } catch (_) {}
  }, []);

  const releaseVoiceResources = useCallback(() => {
    clearTimeout(restartTimerRef.current);
    clearTimeout(recordingTimerRef.current);
    fallbackStartingRef.current = false;
    transcriptionsRef.current.forEach((controller) => controller.abort());
    transcriptionsRef.current.clear();
    cancelPendingPartialCaption();
    sessionRef.current?.stop?.();
    sessionRef.current = null;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try { recorder.stop(); } catch (_) {}
    }
    recorderRef.current = null;
    clearSpeech();
    stopMeter();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
  }, [cancelPendingPartialCaption, clearSpeech, stopMeter]);

  const stop = useCallback(() => {
    activeRef.current = false;
    epochRef.current += 1;
    const epoch = epochRef.current;
    commandQueueRef.current = [];
    releaseVoiceResources();
    onPartialRef.current?.('');
    dispatch({ type: 'stop', epoch });
  }, [releaseVoiceResources]);

  const start = useCallback(async (deviceOverride = selectedMicDeviceId) => {
    if (activeRef.current || !mountedRef.current) return;
    activeRef.current = true;
    const epoch = epochRef.current + 1;
    epochRef.current = epoch;
    dispatch({ type: 'start', epoch });
    onOpenRef.current?.();
    let session = null;
    const switchToFallback = (error) => {
      if (epoch !== epochRef.current || !activeRef.current) return;
      // Preserve the latest caption as a draft, but prevent its timer from
      // changing the fallback-ready phase after the transport has switched.
      flushPendingPartialCaption();
      session?.stop();
      if (sessionRef.current === session) sessionRef.current = null;
      dispatch({ type: 'fallback', epoch, recording: false,
        warning: `${microphoneErrorMessage(error)} Using push-to-talk fallback.` });
    };
    try {
      const stream = await requestNohmMicStream(deviceOverride);
      if (epoch !== epochRef.current) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      await startMeter(stream);
      await enumerateMics();
      if (epoch !== epochRef.current || !activeRef.current) return;
      session = new NohmRealtimeVoiceSession({
        apiBase,
        inputGain: 1,
        onStatus: (phase) => {
          if (epoch !== epochRef.current || !activeRef.current) return;
          if (phase === 'listening') dispatch({ type: 'connected', epoch });
          else if (phase === 'hearing') dispatch({ type: 'hearing', epoch });
          else if (phase === 'transcribing') dispatch({ type: 'transcribing', epoch });
          else if (phase === 'reconnecting') dispatch({ type: 'warning', epoch, message: 'Live connection interrupted. Reconnecting…' });
        },
        onSpeechStart: () => {
          if (epoch === epochRef.current && activeRef.current) clearSpeech({ interrupted: stateRef.current.speaking });
        },
        onPartialTranscript: (partial) => {
          if (epoch !== epochRef.current) return;
          // Starting voice opens the conversation. Captions respect the user's
          // choice to minimize it or inspect a different control panel.
          schedulePartialCaption(partial, epoch);
        },
        onTranscript: (transcript, meta) => {
          if (epoch === epochRef.current) enqueueTranscript(transcript, meta);
        },
        onClose: () => switchToFallback(new Error('Live voice connection closed.')),
        onError: (error, meta = {}) => {
          if (epoch === epochRef.current) {
            if (meta.fatal) switchToFallback(error);
            else {
              if (meta.draft) {
                cancelPendingPartialCaption();
                publishPartialCaption(meta.draft, epoch);
              }
              dispatch({ type: 'listening', epoch, queueDepth: commandQueueRef.current.length });
              dispatch({ type: 'warning', epoch, message: microphoneErrorMessage(error) });
            }
          }
        },
      });
      sessionRef.current = session;
      await session.start({ stream, assistant: 'emil', transcriptionContext });
      // The data-channel open event, not just SDP setup, declares readiness.
    } catch (error) {
      session?.stop();
      if (epoch !== epochRef.current) return;
      if (['NotAllowedError', 'SecurityError', 'NotFoundError', 'DevicesNotFoundError'].includes(error?.name)) {
        activeRef.current = false;
        releaseVoiceResources();
        dispatch({ type: 'error', epoch, message: microphoneErrorMessage(error), recoverable: false });
      } else if (error?.fallbackAvailable === false) {
        activeRef.current = false;
        releaseVoiceResources();
        dispatch({
          type: 'error', epoch,
          message: `${microphoneErrorMessage(error)} Typed map commands remain available.`,
          recoverable: false,
        });
      } else switchToFallback(error);
    }
  }, [apiBase, cancelPendingPartialCaption, clearSpeech, enqueueTranscript, enumerateMics, flushPendingPartialCaption,
    publishPartialCaption, schedulePartialCaption, selectedMicDeviceId, startMeter, releaseVoiceResources, transcriptionContext]);

  const toggle = useCallback(() => {
    if (!activeRef.current) {
      void start();
      return;
    }
    if (stateRef.current.transport === 'upload') {
      if (recorderRef.current?.state === 'recording') stopFallbackRecording();
      else void startFallbackRecording();
      return;
    }
    stop();
  }, [start, startFallbackRecording, stop, stopFallbackRecording]);

  const setMode = useCallback((mode) => {
    const normalized = mode === EMIL_VOICE_MODES.CONVERSATION
      ? EMIL_VOICE_MODES.CONVERSATION
      : EMIL_VOICE_MODES.COMMANDS;
    safeLocalStorageSet(MODE_STORAGE_KEY, normalized);
    if (normalized === EMIL_VOICE_MODES.COMMANDS) clearSpeech();
    dispatch({ type: 'mode', mode: normalized });
  }, [clearSpeech]);

  const selectMicDevice = useCallback((deviceId) => {
    const value = String(deviceId || '');
    setSelectedMicDeviceId(value);
    safeLocalStorageSet(NOHM_VOICE_INPUT_DEVICE_STORAGE_KEY, value);
    if (activeRef.current) {
      stop();
      restartTimerRef.current = window.setTimeout(() => void start(value), 80);
    }
  }, [start, stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRef.current = false;
      epochRef.current += 1;
      commandQueueRef.current = [];
      releaseVoiceResources();
    };
  }, [releaseVoiceResources]);

  const statusLabel = useMemo(() => emilVoiceStatusLabel(state), [state]);
  return {
    ...state,
    statusLabel,
    micLevelStore: micLevelStoreRef.current,
    micDevices,
    selectedMicDeviceId,
    toggle,
    stop,
    setMode,
    selectMicDevice,
    cancelSpeech: () => clearSpeech({ interrupted: true }),
    retry: () => { stop(); restartTimerRef.current = window.setTimeout(() => void start(), 80); },
    clearQueue: () => {
      queueVersionRef.current += 1;
      commandQueueRef.current = [];
      dispatch({ type: 'queue', epoch: epochRef.current, queueDepth: 0 });
    },
    fallbackRecording: state.transport === 'upload' && state.phase === 'hearing',
  };
}
