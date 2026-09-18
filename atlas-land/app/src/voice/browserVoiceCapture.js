export const NOHM_VOICE_INPUT_DEVICE_STORAGE_KEY = 'nohm.voice.inputDeviceId';

const DEFAULT_AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export function safeLocalStorageGet(key) {
  try { return window.localStorage.getItem(key) || ''; }
  catch (_) { return ''; }
}

export function safeLocalStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); }
  catch (_) { /* Storage can be unavailable in embedded/private contexts. */ }
}

export function preferredNohmVoiceMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const choices = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return choices.find((type) => window.MediaRecorder.isTypeSupported?.(type)) || '';
}

export function extensionForMimeType(mimeType = '') {
  const value = String(mimeType).toLowerCase();
  if (value.includes('mp4')) return 'mp4';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('wav')) return 'wav';
  return 'webm';
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    try { track.stop(); } catch (_) { /* Best-effort cleanup. */ }
  });
}

export async function requestNohmMicStream(deviceId = '') {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Browser microphone access is unavailable.');
  }
  const audio = deviceId
    ? { ...DEFAULT_AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } }
    : DEFAULT_AUDIO_CONSTRAINTS;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio });
  } catch (error) {
    if (!deviceId || !['NotFoundError', 'OverconstrainedError'].includes(error?.name)) throw error;
    return navigator.mediaDevices.getUserMedia({ audio: DEFAULT_AUDIO_CONSTRAINTS });
  }
}

export function microphoneErrorMessage(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was denied. Allow it in the browser and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found.';
  }
  return String(error?.message || 'Microphone input failed.');
}
