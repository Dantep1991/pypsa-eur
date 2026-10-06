import { flowHistorySamples } from './flowHistoryView';
import { flowPeriodHours } from './flowPeriodMetrics';

// Physical dimensions, not inferred quantity meaning. Power is time-averaged;
// reported interval energy is additive. Unknown units are never guessed.
export function historyAggregationMethod(unit) {
  if (['kW', 'MW', 'GW'].includes(unit)) return 'mean';
  if (['Wh', 'kWh', 'MWh', 'GWh', 'TWh', 'J', 'kJ', 'MJ', 'GJ', 'TJ', 'PJ'].includes(unit)) return 'sum';
  return null;
}

export function historyAggregationResolutions(history) {
  const native = history.selection.granularity;
  if (!historyAggregationMethod(history.unit)) return [native];
  // A whole week cannot be split accurately across months without finer data.
  return ({ hour: ['hour', 'day', 'week', 'month', 'year'], day: ['day', 'week', 'month', 'year'],
    week: ['week', 'year'], month: ['month', 'year'], year: ['year'] })[native] || [native];
}

function bucket(period, resolution) {
  const date = new Date(period);
  date.setUTCHours(0, 0, 0, 0);
  if (resolution === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (resolution === 'month') date.setUTCDate(1);
  if (resolution === 'year') date.setUTCMonth(0, 1);
  return date.toISOString();
}

export function aggregateFlowHistory(history, lineId, resolution, nearPercent = 99) {
  const native = history.selection.granularity;
  if (resolution === native) return flowHistorySamples(history, lineId, nearPercent);
  if (!historyAggregationResolutions(history).includes(resolution)) throw new Error('This history cannot be aggregated to that resolution.');
  const samples = flowHistorySamples(history, lineId, nearPercent);
  const method = historyAggregationMethod(history.unit), groups = new Map();
  const first = Date.UTC(Number(history.selection.period), 0, 1), end = Date.UTC(Number(history.selection.period) + 1, 0, 1);
  for (const sample of samples) {
    const timestamp = Date.parse(sample.period);
    const duration = flowPeriodHours(sample.period, native);
    const hours = Math.max(0, (Math.min(end, timestamp + duration * 3600000) - Math.max(first, timestamp)) / 3600000);
    if (!hours) continue;
    const key = resolution === 'year' ? `${history.selection.period}-01-01T00:00:00.000Z` : bucket(sample.period, resolution);
    const item = groups.get(key) || { period: key, value: null, count: 0, reportedHours: 0,
      expectedHours: 0, valid: 0, near: 0, maximumRatio: null, total: 0 };
    item.expectedHours += hours;
    if (sample.value != null) {
      item.firstPeriod = item.firstPeriod || sample.firstPeriod || sample.period;
      item.total += sample.value * (method === 'mean' ? hours : 1);
      item.count++;
      item.reportedHours += hours;
      item.valid += sample.valid || 0;
      item.near += sample.near || 0;
      if (sample.maximumRatio != null) item.maximumRatio = Math.max(item.maximumRatio ?? 0, sample.maximumRatio);
    }
    groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => Date.parse(a.period) - Date.parse(b.period))
    .map(({ total, ...item }) => ({ ...item, value: item.count ? total / (method === 'mean' ? item.reportedHours : 1) : null }));
}
