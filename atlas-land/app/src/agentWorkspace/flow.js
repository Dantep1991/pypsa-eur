// The same dependent-control resets are used by the UI and agent. No language routing.
export function updateFlowChoice(previous, updates) {
  let next = updates.runId != null && updates.runId !== previous.runId ? {} : { ...previous };
  if (updates.quantityId != null && updates.quantityId !== previous.quantityId) {
    next.category = undefined;
    next.period = undefined;
    next.dateFrom = '';
    next.dateTo = '';
  }
  if (['period', 'granularity'].some(key => updates[key] != null && updates[key] !== previous[key])) {
    next.dateFrom = ''; next.dateTo = '';
  }
  return { ...next, ...updates };
}

export function flowChoiceMatches(state, values) {
  return Object.entries(values).every(([key, value]) =>
    (key === 'quantityId' ? state.requestedQuantityId : state[key]) === value);
}
