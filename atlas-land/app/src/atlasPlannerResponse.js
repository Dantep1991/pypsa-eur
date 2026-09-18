import { normalizeAtlasModelPlan } from './atlasAgentCommands';

// This validates transport state and a model-made plan, never natural language.
export function readAtlasPlannerResponse(data, visibleLayers = []) {
  const unavailable = { status: 'unavailable', plan: [], confidence: 0 };
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error
      || ['none', 'fallback', 'unavailable'].includes(data.provider)) return unavailable;
  const rawConfidence = Number(data.confidence || 0);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
  const actions = Array.isArray(data.actions)
    ? data.actions.slice(0, 12)
    : typeof data.intent === 'string' ? [{ intent: data.intent, params: data.params || {} }] : [];
  const clarificationOnly = actions.length > 0 && actions.every(action => action?.intent === 'ask_clarification');
  const plan = confidence >= 0.45 || clarificationOnly
    ? normalizeAtlasModelPlan(actions.filter(action => action && typeof action.intent === 'string'), visibleLayers)
    : [];
  return { status: plan.length ? 'ready' : 'unclear', plan, confidence };
}
