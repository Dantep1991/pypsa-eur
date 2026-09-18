import { TextDecoder, TextEncoder } from 'util';
import { askAboutResults, MAX_RESULTS_EVENT_CHARS, MAX_RESULTS_STREAM_BYTES } from './resultsStream';
const encoder = new TextEncoder();
const event = value => `data: ${JSON.stringify(value)}\n\n`;
const answer = { type: 'answer', answer: 'Madrid — génération' };
let previousFetch, previousDecoder;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function response(chunks = []) {
  let index = 0;
  const reader = {
    read: jest.fn(async () => index < chunks.length ? { value: chunks[index++], done: false } : { done: true }),
    cancel: jest.fn(async () => {}), releaseLock: jest.fn(),
  };
  return { ok: true, headers: { get: () => 'text/event-stream; charset=utf-8' },
    body: { getReader: jest.fn(() => reader), cancel: jest.fn(async () => {}) }, reader };
}
beforeEach(() => { previousFetch = global.fetch; previousDecoder = global.TextDecoder; global.TextDecoder = TextDecoder; });
afterEach(() => { global.fetch = previousFetch; global.TextDecoder = previousDecoder; });

test.each(['\n', '\r\n', '\r'])('SSE handles byte-split UTF8, comments and %j boundaries exactly once', async newline => {
  const payload = `: keep alive${newline}${newline}data: {${newline}data: "type":"answer",${newline}data: "answer":"Madrid — génération"}${newline}${newline}`;
  const bytes = encoder.encode(payload);
  const reply = response(Array.from(bytes, byte => new Uint8Array([byte])));
  global.fetch = jest.fn(async () => reply); const seen = jest.fn();
  await askAboutResults('Where?', seen);
  expect(seen).toHaveBeenCalledTimes(1); expect(seen.mock.calls[0][0].answer).toBe(answer.answer);
  expect(reply.reader.cancel).toHaveBeenCalled(); expect(reply.reader.releaseLock).toHaveBeenCalled();
  expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ question: 'Where?', stream: true });
});

test.each([
  'data: not-json\n\n', event({ type: 'error', error: 'private server path' }),
  event({ type: 'answer', answer: {} }), event({ type: 'files_selected', selected_files: [{}], step: 'select', message: 'Selecting' }),
  event({ type: 'log', step: 'x', message: {} }), event({ type: 'unexpected' }),
  event({ type: 'heartbeat' }), 'data: {"type":"answer","answer":"truncated"}',
])('invalid/unfinished streams reject without exposing raw server content (%s)', async payload => {
  const reply = response([encoder.encode(payload)]); global.fetch = jest.fn(async () => reply);
  const seen = jest.fn(); const error = await askAboutResults('Question', seen).catch(e => e);
  expect(error).toBeInstanceOf(Error); expect(error.message).not.toContain('private server path');
  expect(reply.reader.cancel).toHaveBeenCalled(); expect(reply.reader.releaseLock).toHaveBeenCalled();
});

test('callback exceptions propagate instead of being swallowed by the parser', async () => {
  const reply = response([encoder.encode(event(answer))]); global.fetch = jest.fn(async () => reply);
  const failure = new Error('Callback failed');
  await expect(askAboutResults('Question', () => { throw failure; })).rejects.toBe(failure);
  expect(reply.reader.releaseLock).toHaveBeenCalled();
});

test('first answer terminates the read and later events in the same chunk are ignored', async () => {
  const reply = response([encoder.encode(event(answer) + event({ ...answer, answer: 'Wrong second answer' }))]);
  global.fetch = jest.fn(async () => reply); const seen = jest.fn();
  await askAboutResults('Question', seen);
  expect(seen).toHaveBeenCalledTimes(1); expect(reply.reader.read).toHaveBeenCalledTimes(1);
});

test('aborting stalled headers settles immediately and cancels a late response without opening its reader', async () => {
  let resolve; global.fetch = jest.fn(() => new Promise(done => { resolve = done; }));
  const controller = new AbortController(); const seen = jest.fn();
  const result = askAboutResults('Question', seen, { signal: controller.signal }).catch(e => e);
  controller.abort(); expect((await result).name).toBe('AbortError');
  const late = response([encoder.encode(event(answer))]); resolve(late); await flush();
  expect(late.body.getReader).not.toHaveBeenCalled(); expect(late.body.cancel).toHaveBeenCalled();
  expect(seen).not.toHaveBeenCalled();
});

test('aborting a stalled read settles even if cancel also stalls; late bytes cannot publish', async () => {
  const reply = response(); let resolve;
  reply.reader.read.mockImplementation(() => new Promise(done => { resolve = done; }));
  reply.reader.cancel.mockImplementation(() => new Promise(() => {}));
  global.fetch = jest.fn(async () => reply); const controller = new AbortController(); const seen = jest.fn();
  const result = askAboutResults('Question', seen, { signal: controller.signal }).catch(e => e);
  await flush(); controller.abort(); expect((await result).name).toBe('AbortError');
  resolve({ done: false, value: encoder.encode(event(answer)) }); await flush();
  expect(seen).not.toHaveBeenCalled(); expect(reply.reader.cancel).toHaveBeenCalled();
  expect(reply.reader.releaseLock).toHaveBeenCalled();
});

test('abort between resolved headers and reader acquisition cancels the response body', async () => {
  const reply = response(); global.fetch = jest.fn(() => Promise.resolve(reply));
  const controller = new AbortController();
  const result = askAboutResults('Question', jest.fn(), { signal: controller.signal }).catch(e => e);
  await Promise.resolve(); controller.abort();
  expect((await result).name).toBe('AbortError');
  expect(reply.body.getReader).not.toHaveBeenCalled(); expect(reply.body.cancel).toHaveBeenCalled();
});

test.each(['event', 'stream'])('oversized %s is bounded and the reader is cleaned up', async kind => {
  const chunks = kind === 'event' ? [encoder.encode('data: ' + 'x'.repeat(MAX_RESULTS_EVENT_CHARS + 1))]
    : [new Uint8Array(MAX_RESULTS_STREAM_BYTES + 1)];
  const reply = response(chunks); global.fetch = jest.fn(async () => reply);
  await expect(askAboutResults('Question', jest.fn())).rejects.toThrow('too large');
  expect(reply.reader.cancel).toHaveBeenCalled();
});

test.each([false, true])('HTTP/content-type failure never attempts to parse a body (%s)', async ok => {
  const reply = response(); reply.ok = ok; reply.headers.get = () => 'text/html';
  global.fetch = jest.fn(async () => reply);
  await expect(askAboutResults('Question', jest.fn())).rejects.toThrow('service unavailable');
  expect(reply.body.getReader).not.toHaveBeenCalled(); expect(reply.body.cancel).toHaveBeenCalled();
});

test('answer metadata is restricted to safe renderable fields', async () => {
  const reply = response([encoder.encode(event({ ...answer, filtered_rows: {}, total_rows: -1,
    filtering_applied: [null, { column: {} }, { column: 'region', secret: 'discard' }], selected_files: [{}, 'A'] }))]);
  global.fetch = jest.fn(async () => reply); const seen = jest.fn(); await askAboutResults('Question', seen);
  expect(seen.mock.calls[0][0]).toEqual({ ...answer, filtered_rows: undefined, total_rows: undefined,
    filtering_applied: [{ column: 'region' }], selected_files: ['A'] });
});
