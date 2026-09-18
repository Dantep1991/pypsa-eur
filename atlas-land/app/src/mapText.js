// Leaflet interprets string popup/tooltip content as HTML. Source labels must
// pass through this boundary; React's automatic text escaping does not apply.
export const escapeMapText = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function publishedNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatPublishedNumber(value, digits = 0, unit = '') {
  const number = publishedNumber(value);
  if (number == null) return 'Not published';
  return `${number.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
}
