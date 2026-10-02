// Physical period conversions, not congestion inference. Annual net energy can
// cancel opposing transfers; its equivalent FLH is not time spent congested.
const POWER_MW = { kW: .001, MW: 1, GW: 1000 };
const ENERGY_MWH = { kWh: .001, MWh: 1, GWh: 1000, TWh: 1000000 };

export function flowPeriodHours(period, granularity) {
  if (granularity === 'hour') return 1;
  if (granularity === 'day') return 24;
  const date = new Date(period);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  if (granularity === 'year') return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 3600000;
  if (granularity === 'month') return (Date.UTC(year, month + 1, 1) - Date.UTC(year, month, 1)) / 3600000;
  if (granularity === 'week') return 168;
  return null;
}

export function compatibleFlowLimit(line, unit, granularity) {
  const limits = (line?.limits || []).filter(limit => limit.unit === unit
    && (limit.property !== 'Max Flow Day' || granularity === 'day') && Number.isFinite(limit.value) && limit.value !== 0);
  const forward = limits.filter(limit => limit.property !== 'Min Flow' && limit.value > 0);
  const reverse = limits.filter(limit => limit.property === 'Min Flow' && limit.value < 0);
  return { unit, forward: forward.length === 1 ? forward[0].value : null,
    reverse: reverse.length === 1 ? Math.abs(reverse[0].value) : null };
}

export function flowPeriodMetrics(line, value, unit, granularity, direction = 1, period = '') {
  if (!Number.isFinite(value)) return null;
  let limits = line.reportedLimits?.get(period);
  if (!limits && line.reportedLimits) return null; // Never backfill missing run limits with model inputs.
  if (!limits) {
    // Static energy limits must match the period; power limits may be converted
    // to equivalent energy. Ambiguous bands/scenarios are not chosen for users.
    const candidateUnits = [...new Set((line.limits || []).map(limit => limit.unit))]
      .filter(candidate => candidate === unit || (ENERGY_MWH[unit] && POWER_MW[candidate]));
    if (candidateUnits.length !== 1) return null;
    limits = compatibleFlowLimit(line, candidateUnits[0], granularity);
  }
  const capacity = value * direction < 0 ? limits.reverse : limits.forward;
  if (!Number.isFinite(capacity) || capacity <= 0 || capacity >= 1e20) return null;
  const periodHours = flowPeriodHours(period, granularity);
  if (ENERGY_MWH[unit] && POWER_MW[limits.unit]) {
    const fullLoadHours = Math.abs(value) * ENERGY_MWH[unit] / (capacity * POWER_MW[limits.unit]);
    return { fullLoadHours, periodHours, capacity, capacityUnit: limits.unit,
      utilisation: periodHours ? fullLoadHours / periodHours : null };
  }
  if (unit !== limits.unit) return null;
  return { utilisation: Math.abs(value) / capacity, fullLoadHours: null, periodHours, capacity, capacityUnit: limits.unit };
}

export function flowUtilisation(...args) {
  return flowPeriodMetrics(...args)?.utilisation ?? null;
}

export function flowMetricsLabel(metrics, annual = false, net = false) {
  if (!metrics) return '';
  const flh = metrics.fullLoadHours == null ? '' : `${net ? 'Net-equivalent ' : ''}${metrics.fullLoadHours.toLocaleString(undefined, { maximumFractionDigits: 0 })} full-load hours`;
  const utilisation = metrics.utilisation == null ? '' : `${(metrics.utilisation * 100).toFixed(1)}% ${annual ? 'annual utilisation' : 'of declared limit'}`;
  return [flh, utilisation].filter(Boolean).join(' · ');
}
