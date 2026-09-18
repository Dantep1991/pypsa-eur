#!/usr/bin/env node

// Optional live release gate: synthesize one representative Atlas command with
// the configured Nohm voice, then transcribe those exact bytes through the
// upload fallback. This does not request microphone permission or record a user.

const voiceBase = String(
  process.env.NOHM_ATLAS_VOICE_URL
    || 'http://127.0.0.1:5176/atlas-api/api/voice',
).replace(/\/+$/, '');
const phrase = 'Show me France at NUTS3, then add Spain and display the electricity grid.';
const requiredTerms = ['france', 'nuts3', 'spain', 'electricity', 'grid'];

const timeoutSignal = (milliseconds) => (
  typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(milliseconds) : undefined
);

async function checkedJson(response, operation) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = null; }
  if (!response.ok) {
    const detail = body?.error || body?.detail || `HTTP ${response.status}`;
    throw new Error(`${operation} failed: ${detail}`);
  }
  if (!body || typeof body !== 'object') throw new Error(`${operation} returned invalid JSON.`);
  return body;
}

async function main() {
  const status = await checkedJson(await fetch(`${voiceBase}/status`, {
    signal: timeoutSignal(15_000),
    cache: 'no-store',
  }), 'Voice status');
  if (!status.ready || !status.tts?.ready || !status.upload_stt?.ready) {
    throw new Error('Voice status is not ready for both synthesis and upload transcription.');
  }

  const ttsStarted = performance.now();
  const speech = await fetch(`${voiceBase}/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: phrase, assistant: 'emil' }),
    signal: timeoutSignal(45_000),
    cache: 'no-store',
  });
  if (!speech.ok) throw new Error(`Speech synthesis failed: HTTP ${speech.status}`);
  const audio = await speech.arrayBuffer();
  const contentType = speech.headers.get('content-type') || 'audio/wav';
  const ttsMs = Math.round(performance.now() - ttsStarted);
  if (audio.byteLength < 4_096 || !contentType.startsWith('audio/')) {
    throw new Error('Speech synthesis did not return a usable audio payload.');
  }

  const form = new FormData();
  form.append('file', new Blob([audio], { type: contentType }), 'atlas-voice-france.wav');
  form.append('prompt', 'European infrastructure map commands. Preserve country names and network resolution labels.');
  form.append('keywords', JSON.stringify(['France', 'Spain', 'NUTS3', 'electricity', 'grid']));
  const sttStarted = performance.now();
  const transcript = await checkedJson(await fetch(`${voiceBase}/transcribe`, {
    method: 'POST',
    body: form,
    signal: timeoutSignal(75_000),
    cache: 'no-store',
  }), 'Upload transcription');
  const sttMs = Math.round(performance.now() - sttStarted);
  const normalized = String(transcript.text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const missing = requiredTerms.filter(term => !normalized.split(' ').includes(term));
  if (missing.length) {
    throw new Error(`Transcription lost required Atlas terms: ${missing.join(', ')}.`);
  }

  console.log(JSON.stringify({
    ready: true,
    tts_provider: speech.headers.get('x-nohm-voice-provider') || status.tts?.active_provider || null,
    tts_bytes: audio.byteLength,
    tts_ms: ttsMs,
    stt_provider: transcript.provider || null,
    stt_model: transcript.model || null,
    stt_ms: sttMs,
    transcript: transcript.text,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
