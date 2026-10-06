import { useEffect, useRef } from 'react';

export const ATLAS_PROMPT_MESSAGE = 'nohm.atlas.prompt.v1';
export const ATLAS_PROMPT_RECEIPT = 'nohm.atlas.prompt-receipt.v1';

export function readAtlasPrompt(event, parent, origin) {
  const data = event?.data;
  if (event.source !== parent || event.origin !== origin || data?.type !== ATLAS_PROMPT_MESSAGE
      || data.protocolVersion !== 1 || typeof data.requestId !== 'string' || data.requestId.length > 100
      || typeof data.message !== 'string' || !data.message.trim() || data.message.length > 8000
      || !Array.isArray(data.history) || data.history.length > 10 || data.history.some(turn =>
        !['user', 'assistant'].includes(turn?.role) || typeof turn.content !== 'string' || turn.content.length > 4000)) return null;
  return data;
}

export default function useAtlasPromptBridge(onCommand) {
  const latest = useRef(onCommand), active = useRef(null), completed = useRef(new Map());
  useEffect(() => { latest.current = onCommand; }, [onCommand]);
  useEffect(() => {
    const receive = async event => {
      const request = readAtlasPrompt(event, window.parent, window.location.origin);
      if (!request) return;
      const reply = receipt => window.parent.postMessage({ type: ATLAS_PROMPT_RECEIPT,
        requestId: request.requestId, ...receipt }, window.location.origin);
      if (completed.current.has(request.requestId)) { reply(completed.current.get(request.requestId)); return; }
      if (active.current === request.requestId) return;
      if (active.current) { reply({ handled: true, status: 'busy', summary: 'Still working.' }); return; }
      active.current = request.requestId;
      const finish = receipt => {
        completed.current.set(request.requestId, receipt);
        if (completed.current.size > 100) completed.current.delete(completed.current.keys().next().value);
        reply(receipt);
      };
      try {
        const result = await latest.current(request.message, { headless: true, conversationHistory: request.history,
          onReply: summary => reply({ status: 'progress', summary }) });
        finish(result || { handled: true, status: 'failed', summary: 'Cancelled.' });
      } catch (error) {
        finish({ handled: true, status: 'failed', summary: error.message || 'Atlas could not complete this request.' });
      } finally { active.current = null; }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
}
