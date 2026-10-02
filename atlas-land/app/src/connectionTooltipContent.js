import { escapeMapText as escapeHtml } from './mapText';
import { getConnectionCapacity, formatCapacity } from './connectionCapacity';

const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
export function connectionTooltipContent(connection = {}, capacity = getConnectionCapacity(connection)) {
  const valueRow = (label, value, unit = '') => `<div class="atlas-line-tooltip__row"><span>${escapeHtml(label)}</span><strong>${numeric(value) ? `${formatCapacity(Number(value))} ${escapeHtml(unit)}` : escapeHtml(value || 'Not reported')}</strong></div>`;
  const endpoint = value => String(value || '').replace(/^(Node|Gas Node):/, '');
  const parts = [`<strong class="atlas-line-tooltip__title">${escapeHtml(connection.name || connection.id || 'Connection')}</strong>`];
  const from = endpoint(connection.fromNode || connection.from), to = endpoint(connection.toNode || connection.to);
  if (from && to) parts.push(`<div>${escapeHtml(from)} ↔ ${escapeHtml(to)}</div>`);
  if (numeric(connection.atlas_result_baseline_value)) {
    parts.push(valueRow('Baseline', connection.atlas_result_baseline_value, connection.atlas_result_unit));
    parts.push(valueRow('Candidate', connection.atlas_result_candidate_value, connection.atlas_result_unit));
  }
  if (numeric(connection.atlas_result_value)) parts.push(valueRow(connection.atlas_result_label || 'Result', connection.atlas_result_value, connection.atlas_result_unit));
  else if (numeric(connection.metricValue)) parts.push(valueRow(connection.metricLabel || 'Metric', connection.metricValue, connection.metricUnits));
  if (connection.atlas_result_direction_changed) parts.push('<strong>Flow direction reversed</strong>');
  if (connection.atlas_result_direction_supported && numeric(connection.atlas_result_direction_value) && Number(connection.atlas_result_direction_value) !== 0) {
    if (connection.atlas_result_baseline_from_node && connection.atlas_result_baseline_to_node) parts.push(`<div>Baseline: ${escapeHtml(endpoint(connection.atlas_result_baseline_from_node))} → ${escapeHtml(endpoint(connection.atlas_result_baseline_to_node))}</div>`);
    parts.push(`<div>Direction: ${escapeHtml(endpoint(connection.atlas_result_from_node))} → ${escapeHtml(endpoint(connection.atlas_result_to_node))}</div>`);
  }
  if (connection.atlas_result_period) parts.push(`<div>${escapeHtml(connection.atlas_result_period)}</div>`);
  if (capacity && numeric(capacity.value)) parts.push(valueRow(capacity.kind || 'Declared capacity', capacity.value, capacity.units));
  if (capacity && numeric(capacity.available) && capacity.available !== capacity.value) parts.push(valueRow('Available limit', capacity.available, capacity.availableUnits));
  if (connection.atlas_distillation_status) parts.push(`<div>Preview: ${escapeHtml(connection.atlas_distillation_status)} · ${escapeHtml(connection.atlas_distillation_reason || '')}</div>`);
  return `<div class="atlas-line-tooltip">${parts.join('')}</div>`;
}
