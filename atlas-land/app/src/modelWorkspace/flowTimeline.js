// UTC bucket identity shared by the map and connection history. No interpolation.
export function flowPeriodIndex(periods, period, resolution = 'hour') {
  const target = Date.parse(period);
  if (!Number.isFinite(target)) return 0;
  const exact = periods.findIndex(value => Date.parse(value) === target);
  if (exact >= 0) return exact;
  if (resolution === 'hour') return -1;
  return periods.findIndex(value => {
    const start = new Date(value), end = new Date(value);
    if (resolution === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
    else if (resolution === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
    else end.setUTCDate(end.getUTCDate() + (resolution === 'week' ? 7 : 1));
    return target >= start.getTime() && target < end.getTime();
  });
}

export function flowRangeWindows(dateFrom, dateTo, connections = 1) {
  const first = Date.parse(String(dateFrom).slice(0, 10)), last = Date.parse(String(dateTo).slice(0, 10));
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) throw new Error('Choose a valid flow date range.');
  const days = Math.min(28, Math.floor(60000 / (Math.max(1, connections) * 24)));
  if (days < 1) throw new Error('Narrow the connection category before loading hourly flows.');
  const windows = [];
  for (let start = first; start <= last; start += days * 86400000) windows.push({
    dateFrom: new Date(start).toISOString().slice(0, 10),
    dateTo: new Date(Math.min(last, start + (days - 1) * 86400000)).toISOString().slice(0, 10),
  });
  return windows;
}

export function mergeFlowWindows(chunks, selection) {
  const lines = new Map(), periods = new Set(), warnings = [];
  const unit = chunks[0]?.unit, direction = chunks[0]?.direction;
  // Exclusions require one consistent object scope, not different objects in
  // different windows. Never hide window-specific disputes behind a clean view.
  if (chunks.some(chunk=>chunk.quality?.excluded_entity_count)) throw new Error('Resolve disputed observations before combining hourly windows.');
  for (const chunk of chunks) {
    if (chunk.unit !== unit || chunk.direction !== direction) throw new Error('Flow windows contain incompatible units or directions.');
    const first = Date.parse(chunk.selection.dateFrom), last = Date.parse(chunk.selection.dateTo) + 86400000;
    if (chunk.periods.some(period => Date.parse(period) < first || Date.parse(period) >= last)) throw new Error('Flows escaped the requested date window.');
    chunk.periods.forEach(period => periods.add(period));
    warnings.push(...(chunk.warnings || []));
    for (const line of chunk.lines) {
      const existing = lines.get(line.id) || {...line, values: new Map(), reportedLimits: new Map()};
      for (const [period, value] of line.values) {
        if (existing.values.has(period)) throw new Error('Overlapping flow windows were returned.');
        existing.values.set(period, value);
      }
      line.reportedLimits?.forEach((limit, period) => existing.reportedLimits.set(period, limit));
      lines.set(line.id, existing);
    }
  }
  const values = [...lines.values()], mapped = values.filter(line => line.coordinates?.length >= 2);
  return {...chunks[0], selection, unit, direction, lines: values, periods: [...periods].sort(), warnings,
    maximum: Math.max(0, ...chunks.map(chunk => chunk.maximum || 0)),
    coverage: {rows: values.reduce((sum, line) => sum + line.values.size, 0), objects: values.length,
      matched: values.length, mapped: mapped.length, unmapped: values.length - mapped.length, unmatched: 0},
    analysis_query: {...chunks[0]?.analysis_query, date_from: selection.dateFrom, date_to: `${selection.dateTo}T23:59:59`},
  };
}
