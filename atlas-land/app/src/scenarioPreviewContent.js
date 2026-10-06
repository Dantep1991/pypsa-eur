import { escapeMapText as escapeHtml } from './mapText';

export function scenarioPreviewContent(preview) {
  if (!preview) return '';
  const value = item => item?.status === 'resolved' && item.value != null ? `${item.value} ${item.unit || ''}` : `Unresolved: ${item?.note || 'No reported value'}`;
  return `<section class="atlas-scenario-detail"><strong>Scenario input preview · ${escapeHtml(preview.status)}</strong><div>${escapeHtml(preview.inputDate)} · model-local time</div>
    ${(preview.changes || []).map(row => `<div><strong>${escapeHtml(row.property)}</strong><div>Before: ${escapeHtml(value(row.before))}</div><div>With scenarios: ${escapeHtml(value(row.after))}</div></div>`).join('')}
    <small>Read-only input snapshot, not solved results.</small></section>`;
}
