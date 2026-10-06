import { escapeMapText } from './mapText';
import { nodeHoverText } from './regionBoundaries';

export const hasResultValue = facility => Number.isFinite(facility?.atlas_result_value);
const formatted = value => new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 }).format(value);

export function resultTooltipContent(facility) {
  const title = escapeMapText(nodeHoverText(facility));
  if (!hasResultValue(facility)) return title;
  const row = (label, value) => `<div>${escapeMapText(label)}: <strong>${escapeMapText(formatted(value))} ${escapeMapText(facility.atlas_result_unit || '')}</strong></div>`;
  const comparison = Number.isFinite(facility.atlas_result_baseline_value) && Number.isFinite(facility.atlas_result_candidate_value);
  return `<strong>${title}</strong>`
    + (comparison ? row('Baseline', facility.atlas_result_baseline_value) + row('Candidate', facility.atlas_result_candidate_value) : '')
    + row(facility.atlas_result_label || 'Result', facility.atlas_result_value)
    + `<div>${escapeMapText(facility.atlas_result_period || '')}</div>`;
}
