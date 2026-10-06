const firstNumber = (values, minimum, inclusive = false) => {
  for (const value of values) {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && (inclusive ? number >= minimum : number > minimum)) return number;
  }
  return null;
};
const positive = (...values) => firstNumber(values, 0);
const nonNegative = (...values) => firstNumber(values, 0, true);

export function getConnectionCapacity(connection) {
  if (!connection) return null;
  const gas = positive(connection.capacity_gwh_d, connection.scigrid_capacity_gwh_d, connection.entsog_capacity_gwh_d);
  if (gas != null) return {
    value: gas, units: 'GWh/d',
    kind: positive(connection.capacity_gwh_d, connection.scigrid_capacity_gwh_d) != null
      ? 'Estimated pipeline capacity' : 'ENTSOG border capacity',
    available: null, availableUnits: 'GWh/d', securityFactor: null,
  };
  // Infrastructure adapters also use s_nom as a display value. Preserve their
  // declared units instead of relabelling oil/port throughput as electric MVA.
  const declaredUnits = String(connection.capacity_units || '').trim();
  if (declaredUnits) {
    const value = positive(connection.s_nom_opt, connection.s_nom, connection.p_nom_opt, connection.p_nom);
    if (value != null) return { value, units: declaredUnits, kind: 'Reported capacity',
      available: null, availableUnits: declaredUnits, securityFactor: null };
  }
  const apparentPower = positive(connection.s_nom_opt, connection.s_nom);
  const activePower = positive(connection.p_nom_opt, connection.p_nom);
  if (apparentPower == null && activePower == null) return null;
  const isApparent = apparentPower != null;
  const value = isApparent ? apparentPower : activePower;
  const units = isApparent ? 'MVA' : 'MW';
  const factor = nonNegative(isApparent ? connection.s_max_pu : connection.p_max_pu);
  const optimized = positive(isApparent ? connection.s_nom_opt : connection.p_nom_opt) != null;
  return {
    value, units,
    kind: `${optimized ? 'Optimised' : 'Nominal'} ${isApparent ? 'rating' : 'capacity'}`,
    available: factor == null ? null : value * factor,
    availableUnits: units, securityFactor: factor,
  };
}

export function connectionCapacityScales(connections) {
  const groups = new Map();
  for (const connection of connections) {
    const capacity = getConnectionCapacity(connection);
    if (!capacity) continue;
    if (!groups.has(capacity.units)) groups.set(capacity.units, []);
    groups.get(capacity.units).push(capacity.value);
  }
  return [...groups].map(([units, values]) => {
    values.sort((a, b) => a - b);
    const percentile = fraction => values[Math.floor((values.length - 1) * fraction)];
    let low = percentile(0.05);
    let high = percentile(0.95);
    // A nearly uniform inventory can have identical p5/p95 despite genuine
    // outliers. Show its actual range instead of a misleading single-value ramp.
    const percentileRange = high > low;
    if (!percentileRange) { low = values[0]; high = values.at(-1); }
    const logLow = Math.log1p(low);
    const logSpan = Math.log1p(high) - logLow;
    return {
      units, count: values.length, low, high,
      uniform: !(high > low), rangeLabel: percentileRange ? 'p5–p95' : 'reported range',
      // The middle label must correspond to the middle colour, not the median.
      mid: Math.expm1(logLow + logSpan * 0.5),
      normalize: value => logSpan > 0
        ? Math.max(0, Math.min(1, (Math.log1p(value) - logLow) / logSpan)) : 0.5,
    };
  });
}

export function formatCapacity(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const numeric = Number(value);
  const magnitude = Math.abs(numeric);
  if (magnitude > 0 && magnitude < 0.1) return new Intl.NumberFormat(undefined, {
    maximumSignificantDigits: 3, notation: magnitude < 0.0001 ? 'scientific' : 'standard',
  }).format(numeric);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: numeric >= 100 ? 0 : numeric >= 10 ? 1 : 2 });
}

export function capacityColor(ratio) {
  const t = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `hsl(${(202 - 190 * t).toFixed(1)} 88% ${(58 + 4 * t).toFixed(1)}%)`;
}
