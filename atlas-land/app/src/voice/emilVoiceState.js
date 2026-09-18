export const EMIL_VOICE_MODES = Object.freeze({
  COMMANDS: 'commands',
  CONVERSATION: 'conversation',
});

export const INITIAL_EMIL_VOICE_STATE = Object.freeze({
  active: false,
  mode: EMIL_VOICE_MODES.COMMANDS,
  phase: 'idle',
  transport: '',
  partial: '',
  lastTranscript: '',
  queueDepth: 0,
  speaking: false,
  error: '',
  warning: '',
  epoch: 0,
});

export function emilVoiceReducer(state, event) {
  if (event.epoch != null && event.epoch !== state.epoch && !['start', 'stop'].includes(event.type)) return state;
  switch (event.type) {
    case 'start':
      return {
        ...state,
        active: true,
        phase: 'connecting',
        transport: '',
        partial: '',
        error: '',
        warning: '',
        epoch: event.epoch,
      };
    case 'connected':
      return { ...state, active: true, phase: 'listening', transport: 'realtime', error: '', warning: '' };
    case 'fallback':
      return {
        ...state,
        active: true,
        phase: event.recording ? 'hearing' : 'fallback_ready',
        transport: 'upload',
        error: '',
        warning: event.warning || 'Realtime unavailable; using push-to-talk transcription.',
      };
    case 'hearing':
      return { ...state, phase: 'hearing', partial: event.partial ?? state.partial, speaking: false };
    case 'partial':
      return { ...state, phase: 'hearing', partial: event.text || '' };
    case 'transcribing':
      return { ...state, phase: 'transcribing' };
    case 'enqueue':
      return {
        ...state,
        phase: event.executing ? 'executing' : 'listening',
        partial: '',
        lastTranscript: event.text || state.lastTranscript,
        queueDepth: event.queueDepth ?? state.queueDepth,
      };
    case 'executing':
      return { ...state, phase: 'executing', queueDepth: event.queueDepth ?? state.queueDepth };
    case 'queue':
      return { ...state, queueDepth: event.queueDepth ?? state.queueDepth };
    case 'speaking':
      return { ...state, phase: 'speaking', speaking: true, queueDepth: event.queueDepth ?? state.queueDepth };
    case 'interrupted':
      return { ...state, phase: 'interrupted', speaking: false };
    case 'listening':
      return {
        ...state,
        phase: state.transport === 'upload' ? 'fallback_ready' : 'listening',
        speaking: false,
        partial: '',
        queueDepth: event.queueDepth ?? state.queueDepth,
      };
    case 'mode':
      return { ...state, mode: event.mode, error: '' };
    case 'warning':
      return { ...state, warning: event.message || '' };
    case 'error':
      return { ...state, active: Boolean(event.recoverable), phase: 'error', speaking: false, error: event.message || 'Voice mode failed.' };
    case 'stop':
      return { ...INITIAL_EMIL_VOICE_STATE, mode: state.mode, epoch: event.epoch ?? state.epoch };
    default:
      return state;
  }
}

export function emilVoiceStatusLabel(state) {
  if (!state.active && state.phase !== 'error') return 'Voice off';
  switch (state.phase) {
    case 'connecting': return 'Connecting live voice…';
    case 'listening': return state.queueDepth ? `Listening · ${state.queueDepth} queued` : 'Listening';
    case 'fallback_ready': return 'Push to talk ready';
    case 'hearing': return 'Listening to you…';
    case 'transcribing': return 'Finishing what you said…';
    case 'executing': return state.queueDepth > 1 ? `Updating map · ${state.queueDepth - 1} queued` : 'Updating map…';
    case 'speaking': return 'EMIL speaking · talk to interrupt';
    case 'interrupted': return 'Interrupted · listening';
    case 'error': return state.error || 'Voice unavailable';
    default: return 'Voice off';
  }
}

export function selectSpokenReply(replies) {
  const values = (replies || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => !/^Plan ready\b/i.test(value))
    .filter((value) => !/^(Loading|Staging|Selecting|Switching|Solving|Saving)\b.*(?:…|\.\.\.)$/i.test(value));
  return values[values.length - 1] || '';
}
