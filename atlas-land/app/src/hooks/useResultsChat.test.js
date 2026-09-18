import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useResultsChat, RESULTS_CHAT_IDLE_MS, RESULTS_CHAT_TOTAL_MS } from './useResultsChat';
import { askAboutResults } from '../utils/resultsStream';
jest.mock('../utils/resultsStream', () => ({ askAboutResults: jest.fn() }));
let calls, selectFile;
const answer = { type: 'answer', answer: 'Done', total_rows: 20, filtered_rows: 10 };
const progress = { type: 'log', step: 'Read', message: 'Reading data' };
const flush = async () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
function renderChat(active = true) {
  return renderHook(props => {
    const [messages, setMessages] = useState([]);
    const chat = useResultsChat({ active: props.active, setMessages, files: [{ id: 'A', name: 'File A' }], selectFile });
    return { ...chat, messages, setMessages };
  }, { initialProps: { active } });
}
beforeEach(() => {
  jest.useFakeTimers(); calls = []; selectFile = jest.fn(); askAboutResults.mockReset();
  askAboutResults.mockImplementation((question, callback, options) => new Promise((resolve, reject) => {
    calls.push({ question, callback, ...options, resolve, reject });
  }));
});
afterEach(() => { cleanup(); jest.useRealTimers(); });

test('one owned request preserves concurrent history and finishes once on the first answer', async () => {
  const view = renderChat();
  act(() => { view.result.current.send('First'); view.result.current.send('Duplicate'); });
  expect(calls).toHaveLength(1); expect(view.result.current.loading).toBe(true);
  act(() => view.result.current.setMessages(prev => [...prev, { id: 'external', text: 'Concurrent' }]));
  act(() => calls[0].callback(progress)); expect(view.result.current.progress).toEqual({ step: 'Read', message: 'Reading data' });
  act(() => calls[0].callback({ type: 'files_selected', step: 'Select', message: 'Selected', selected_files: ['File A'] }));
  expect(selectFile).toHaveBeenCalledWith('A');
  act(() => { calls[0].callback(answer); calls[0].callback({ ...answer, answer: 'Late duplicate' }); });
  expect(view.result.current.messages.map(m => m.text)).toEqual(['First', 'Concurrent', 'Done']);
  expect(new Set(view.result.current.messages.map(m => m.id)).size).toBe(3);
  expect(view.result.current.loading).toBe(false); expect(view.result.current.progress).toBe(null);
  expect(jest.getTimerCount()).toBe(0); expect(calls[0].signal.aborted).toBe(true);
  calls[0].reject(new Error('late failure')); await flush();
  expect(view.result.current.messages).toHaveLength(3);
});

test('Stop releases controls immediately and an old completion cannot finish the next request', async () => {
  const view = renderChat(); act(() => view.result.current.send('First'));
  act(() => view.result.current.stop());
  expect(view.result.current.messages[1].text).toContain('server may still finish');
  expect(view.result.current.loading).toBe(false); expect(jest.getTimerCount()).toBe(0);
  act(() => view.result.current.send('Second'));
  act(() => calls[0].callback({ type: 'files_selected', step: 'Select', message: 'Late', selected_files: ['A'] }));
  calls[0].reject(new Error('Private error')); await flush();
  expect(selectFile).not.toHaveBeenCalled(); expect(view.result.current.loading).toBe(true);
  act(() => calls[1].callback(answer));
  expect(view.result.current.messages.map(m => m.text)).toEqual(['First', expect.stringContaining('Stopped'), 'Second', 'Done']);
});

test('silent request times out independently of an abort-ignoring transport and permits retry', () => {
  const view = renderChat(); act(() => view.result.current.send('Question'));
  act(() => jest.advanceTimersByTime(RESULTS_CHAT_IDLE_MS));
  expect(view.result.current.loading).toBe(false); expect(calls[0].signal.aborted).toBe(true);
  expect(view.result.current.messages[1]).toMatchObject({ text: 'Analysis timed out. Please try again.', isError: true });
  act(() => view.result.current.send('Retry')); expect(calls).toHaveLength(2);
});

test('heartbeats extend idle deadline but never extend the absolute analysis deadline', () => {
  const view = renderChat(); act(() => view.result.current.send('Question'));
  for (let elapsed = 30_000; elapsed < RESULTS_CHAT_TOTAL_MS; elapsed += 30_000) {
    act(() => { jest.advanceTimersByTime(30_000); calls[0].callback({ type: 'heartbeat' }); });
    expect(view.result.current.loading).toBe(true);
  }
  act(() => jest.advanceTimersByTime(30_000));
  expect(view.result.current.loading).toBe(false); expect(jest.getTimerCount()).toBe(0);
  expect(view.result.current.messages[1].text).toContain('timed out');
});

test('deactivation/unmount aborts all timers and late events without writing hidden messages', () => {
  const view = renderChat(); act(() => view.result.current.send('Question'));
  view.rerender({ active: false });
  expect(calls[0].signal.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  expect(view.result.current.loading).toBe(false);
  act(() => { calls[0].callback(answer); view.result.current.send('Hidden question'); });
  expect(calls).toHaveLength(1); expect(view.result.current.messages).toHaveLength(1);
  view.rerender({ active: true }); act(() => view.result.current.send('New question'));
  view.unmount(); expect(calls[1].signal.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  act(() => calls[1].callback(answer)); expect(selectFile).not.toHaveBeenCalled();
});

test('transport failures are redacted and unknown analysis files cannot alter selection', async () => {
  const view = renderChat(); act(() => view.result.current.send('Question'));
  act(() => calls[0].callback({ type: 'files_selected', step: 'Select', message: 'Selected', selected_files: ['Missing'] }));
  expect(selectFile).not.toHaveBeenCalled();
  calls[0].reject(new Error('private server path')); await flush();
  expect(view.result.current.messages[1]).toMatchObject({ text: 'Could not complete the analysis. Please try again.', isError: true });
  expect(view.result.current.loading).toBe(false); expect(jest.getTimerCount()).toBe(0);
});
