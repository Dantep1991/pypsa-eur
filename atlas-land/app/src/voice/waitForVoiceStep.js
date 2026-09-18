function cancelled() {
  return new DOMException('Voice session was stopped.', 'AbortError');
}

// Cancellation must release the caller even if a transport/body ignores abort.
// Prefer a factory so cancelled work is never started; promises are supported
// for existing WebRTC operations which have already begun.
export async function waitForVoiceStep(step, signal) {
  if (signal.aborted) {
    if (typeof step !== 'function') void Promise.resolve(step).catch(() => {});
    throw cancelled();
  }
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => reject(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const work = typeof step === 'function' ? Promise.resolve().then(() => {
    if (signal.aborted) throw cancelled();
    return step();
  }) : step;
  try { return await Promise.race([work, interrupted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
