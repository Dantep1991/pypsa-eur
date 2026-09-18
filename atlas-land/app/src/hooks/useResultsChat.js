import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { askAboutResults } from '../utils/resultsStream';

export const RESULTS_CHAT_IDLE_MS = 45_000;
export const RESULTS_CHAT_TOTAL_MS = 300_000;
let messageSequence = 0;
const message = (text, extra = {}) => ({ id: `results-${Date.now()}-${++messageSequence}`,
  text, sender: 'bot', timestamp: new Date(), ...extra });

export function useResultsChat({ active, setMessages, files, selectFile }) {
  const latest = useRef({ active, setMessages, files, selectFile });
  const run = useRef(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const clear = request => {
    clearTimeout(request.idle); clearTimeout(request.total);
    request.controller.abort();
  };
  const stop = useCallback((text = 'Stopped receiving this analysis. The server may still finish its job.') => {
    const request = run.current;
    if (!request) return;
    run.current = null; clear(request);
    setLoading(false); setProgress(null);
    if (text) latest.current.setMessages(prev => [...prev, message(text)]);
  }, []);
  useLayoutEffect(() => { latest.current = { active, setMessages, files, selectFile }; });
  useLayoutEffect(() => {
    if (!active) { stop(null); setLoading(false); setProgress(null); return undefined; }
    return () => {
      if (run.current) { clear(run.current); run.current = null; }
    };
  }, [active, stop]);

  const send = useCallback(question => {
    const text = question.trim();
    if (!text || !latest.current.active || run.current) return false;
    const request = { controller: new AbortController() };
    run.current = request;
    setInput(''); setLoading(true); setProgress(null);
    latest.current.setMessages(prev => [...prev, message(text, { sender: 'user' })]);
    const owns = () => run.current === request && latest.current.active && !request.controller.signal.aborted;
    const finish = (text, extra) => {
      if (!owns()) return;
      run.current = null; clear(request); setLoading(false); setProgress(null);
      latest.current.setMessages(prev => [...prev, message(text, extra)]);
    };
    const timeout = () => finish('Analysis timed out. Please try again.', { isError: true });
    const touch = () => { clearTimeout(request.idle); request.idle = setTimeout(timeout, RESULTS_CHAT_IDLE_MS); };
    touch(); request.total = setTimeout(timeout, RESULTS_CHAT_TOTAL_MS);
    askAboutResults(text, event => {
      if (!owns()) return;
      touch();
      if (event.type === 'heartbeat') return;
      if (event.type === 'answer') {
        const { answer, type, ...metadata } = event;
        finish(answer, { metadata });
      } else {
        setProgress({ step: event.step, message: event.message });
        if (event.type === 'files_selected') {
          const file = (latest.current.files || []).find(file => file.id === event.selected_files[0]
            || file.name === event.selected_files[0]);
          if (file) latest.current.selectFile(file.id);
        }
      }
    }, { signal: request.controller.signal }).catch(() => {
      finish('Could not complete the analysis. Please try again.', { isError: true });
    });
    return true;
  }, []);
  return { input, setInput, loading, progress, send, stop };
}
