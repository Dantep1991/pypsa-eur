const FILTER_FIELDS = ['category_name', 'child_name', 'collection_name', 'sample_name'];
const DIMENSIONS = [...FILTER_FIELDS, 'property_name'];
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

export function resultsTimestamp(value) {
  if (typeof value !== 'string') return null;
  const sourceDate = value.trim(), match = ISO_DATE.exec(sourceDate);
  if (!match) return null;
  const [, yearText, monthText, dayText, hour, minute, second, fraction, zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hour || 0) > 23 || Number(minute || 0) > 59 || Number(second || 0) > 59) return null;
  const clock = zone ? 'utc' : 'source';
  // Naive timestamps are placed on a separate, timezone-unspecified axis. Using
  // Z for its numeric coordinates prevents the browser's timezone shifting it;
  // it does NOT assert that the original observation was in UTC.
  const time = Date.parse(`${yearText}-${monthText}-${dayText}T${hour || '00'}:${minute || '00'}:${second || '00'}${fraction || ''}${zone?.toUpperCase() || 'Z'}`);
  return Number.isFinite(time) ? { time, clock, sourceDate } : null;
}

export function formatResultsTick(value, resolution = 'day') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, resolution === 'year' ? 4 : resolution === 'month' ? 7 : 10);
}

// Recharts may generate repeated numeric ticks when several observations share
// an instant or the visible interval is narrow. Duplicate ticks receive the
// same React key and can flicker or disappear. Keep every observation in the
// scatter data, but give the axis a small deterministic set of unique times.
export function resultsAxisTicks(points, maxTicks = 6) {
  const limit = Math.max(2, Math.min(12, Math.floor(Number(maxTicks) || 6)));
  const unique = [...new Set((Array.isArray(points) ? points : [])
    .map(point => Number(point?.time)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (unique.length <= limit) return unique;
  const indexes = [...new Set(Array.from(
    { length: limit },
    (_, index) => Math.round(index * (unique.length - 1) / (limit - 1)),
  ))];
  return indexes.map(index => unique[index]);
}

// Observations, not inferred totals: there is no summation, interpolation,
// averaging, conversion between units, or deduplication of equal timestamps.
export function buildResultsPreview(rows, filters = {}) {
  const grouped = new Map();
  const excluded = { filters: 0, value: 0, date: 0, unit: 0 };
  for (const row of rows) {
    if (FILTER_FIELDS.some(field => filters[field] && row[field] !== filters[field])) { excluded.filters++; continue; }
    const raw = row.value;
    const value = typeof raw === 'number' ? raw
      : typeof raw === 'string' && DECIMAL.test(raw.trim()) ? Number(raw) : NaN;
    if (!Number.isFinite(value)) { excluded.value++; continue; }
    const stamp = resultsTimestamp(row._date);
    if (!stamp) { excluded.date++; continue; }
    if (row.unit_name != null && typeof row.unit_name !== 'string') { excluded.unit++; continue; }
    const unit = row.unit_name?.trim() || '';
    const key = JSON.stringify([unit, stamp.clock]);
    if (!grouped.has(key)) grouped.set(key, { key, unit, clock: stamp.clock,
      label: `${unit || 'Unit not supplied'} · ${stamp.clock === 'utc' ? 'UTC' : 'source time'}`, points: [] });
    const dimensions = DIMENSIONS.filter(field => typeof row[field] === 'string' && row[field].trim())
      .map(field => ({ field, value: row[field] }));
    grouped.get(key).points.push({ ...stamp, value, dimensions });
  }
  const groups = [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label));
  for (const group of groups) group.points.sort((a, b) => a.time - b.time);
  return { groups, excluded, skipped: excluded.value + excluded.date + excluded.unit,
    observations: groups.reduce((sum, group) => sum + group.points.length, 0) };
}
