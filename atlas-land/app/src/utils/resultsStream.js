import { API_BASE_URL } from '../config/api';

export const MAX_RESULTS_EVENT_CHARS = 1_000_000;
export const MAX_RESULTS_STREAM_BYTES = 8_000_000;
const abortError = () => new DOMException('Analysis stopped', 'AbortError');
const stopped = signal => { if (signal?.aborted) throw abortError(); };
const cancelQuietly = target => {
  try { Promise.resolve(target?.cancel()).catch(() => {}); } catch (_) { /* Already closed. */ }
};

// Settle promptly even if a transport ignores AbortSignal. Only that transport's
// late completion remains pending; it cannot publish or decode application data.
function withAbort(promise, signal, disposeLate) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) { disposeLate?.(value); reject(abortError()); }
      else resolve(value);
    }, error => { signal?.removeEventListener('abort', abort); reject(error); });
  });
}

function parseEvent(text) {
  let event;
  try { event = JSON.parse(text); } catch (_) { throw new Error('Invalid analysis stream'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid analysis event');
  // Server details stay off screen and out of the browser console.
  if (event.type === 'error') throw new Error('Analysis failed');
  if (event.type === 'heartbeat') return { type: 'heartbeat' };
  if (event.type === 'answer') {
    if (typeof event.answer !== 'string' || !event.answer.trim()) throw new Error('Invalid analysis answer');
    const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    return { type: 'answer', answer: event.answer,
      filtered_rows: count(event.filtered_rows), total_rows: count(event.total_rows),
      selected_files: Array.isArray(event.selected_files) ? event.selected_files.filter(v => typeof v === 'string') : [],
      filtering_applied: Array.isArray(event.filtering_applied)
        ? event.filtering_applied.filter(v => v && typeof v.column === 'string').map(v => ({ column: v.column })) : [],
    };
  }
  if (event.type === 'log' || event.type === 'files_selected') {
    if (typeof event.step !== 'string' || typeof event.message !== 'string') throw new Error('Invalid analysis progress');
    if (event.type === 'files_selected' && (!Array.isArray(event.selected_files)
      || event.selected_files.some(v => typeof v !== 'string'))) throw new Error('Invalid analysis files');
    return { type: event.type, step: event.step, message: event.message,
      ...(event.type === 'files_selected' ? { selected_files: event.selected_files } : {}) };
  }
  throw new Error('Unknown analysis event');
}

export async function askAboutResults(question, onStreamData, { signal } = {}) {
  stopped(signal);
  const response = await withAbort(fetch(`${API_BASE_URL}/api/emil/ask-about-results`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ question, stream: true }), signal,
  }), signal, late => cancelQuietly(late.body));
  if (signal?.aborted) { cancelQuietly(response.body); throw abortError(); }
  if (!response.ok || !response.headers?.get('content-type')?.toLowerCase().startsWith('text/event-stream')) {
    cancelQuietly(response.body);
    throw new Error('Analysis service unavailable');
  }
  let reader;
  try { reader = response.body?.getReader(); }
  catch (_) { cancelQuietly(response.body); throw new Error('Analysis stream unavailable'); }
  if (!reader) throw new Error('Analysis stream unavailable');
  const cancel = () => cancelQuietly(reader);
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let buffer = '', dataLines = [], eventChars = 0, bytes = 0, answered = false, index = 0;
  const dispatch = () => {
    if (!dataLines.length) return;
    const event = parseEvent(dataLines.join('\n'));
    dataLines = []; eventChars = 0;
    stopped(signal);
    // Callback exceptions must propagate, not masquerade as JSON parse errors.
    onStreamData?.(event);
    if (event.type === 'answer') answered = true;
  };
  const line = value => {
    if (!value) { dispatch(); return; }
    if (!value.startsWith('data:')) return;
    const data = value.slice(5).replace(/^ /, '');
    eventChars += data.length + 1;
    if (eventChars > MAX_RESULTS_EVENT_CHARS) throw new Error('Analysis event too large');
    dataLines.push(data);
  };
  const consume = (text, final = false) => {
    buffer += text;
    while (index < buffer.length && !answered) {
      const code = buffer[index];
      if (code !== '\r' && code !== '\n') { index++; continue; }
      if (code === '\r' && index === buffer.length - 1 && !final) break;
      line(buffer.slice(0, index));
      const advance = code === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
      buffer = buffer.slice(index + advance); index = 0;
    }
    if (!answered && buffer.length + eventChars > MAX_RESULTS_EVENT_CHARS) throw new Error('Analysis event too large');
  };
  try {
    while (!answered) {
      stopped(signal);
      const { done, value } = await withAbort(reader.read(), signal);
      stopped(signal);
      if (done) {
        consume(decoder.decode(), true);
        // A truncated event is not a successful answer. SSE requires a blank
        // event delimiter; EOF with only progress also cannot claim completion.
        if (!answered) throw new Error('Analysis ended without an answer');
        break;
      }
      bytes += value.byteLength;
      if (bytes > MAX_RESULTS_STREAM_BYTES) throw new Error('Analysis stream too large');
      consume(decoder.decode(value, { stream: true }));
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
    try { reader.releaseLock(); } catch (_) { /* Cancelled read may still be settling. */ }
  }
}
