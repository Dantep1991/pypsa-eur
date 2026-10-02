import { escapeMapText as escapeHtml, formatPublishedNumber as fmt, publishedNumber } from './mapText';

// Construct on hover/click, not once per feature during a country refresh.
// Unpublished values are not zeros and never imply an available connection.
export function buildGridAccessPopupContent(properties = {}) {
  const p = properties || {};
  const leadTime = publishedNumber(p.lead_time_years);
  const pressure = publishedNumber(p.pressure_pct);
  const confidence = publishedNumber(p.location_confidence);
  const voltage = publishedNumber(p.voltage_kv);
  const target = p.earliest_target_date
    ? `${escapeHtml(p.earliest_target_date)}${leadTime != null ? ` · ${fmt(leadTime, 1)} years` : ''}`
    : 'Not published';
  const samples = Array.isArray(p.project_samples)
    ? p.project_samples.filter(project => project && typeof project === 'object').slice(0, 3) : [];
  const projects = samples.length
    ? `<div class="atlas-grid-access-popup__projects"><div class="atlas-grid-access-popup__section-title">Largest mapped projects</div>${samples.map(project => `<div class="atlas-grid-access-popup__project">${escapeHtml(project.name || 'Unnamed project')} <span>${fmt(project.capacity_mw, 0, 'MW')}${project.target_connection_date ? ` · ${escapeHtml(project.target_connection_date)}` : ''}</span></div>`).join('')}</div>`
    : '';
  const sourceKeys = Array.isArray(p.source_keys) ? p.source_keys : [];
  return `<div class="atlas-grid-access-popup">
    <div class="atlas-grid-access-popup__title">${escapeHtml(p.name || 'Connection site')}</div>
    <div class="atlas-grid-access-popup__meta">${escapeHtml(p.side_label || '')}${voltage != null ? ` · ${fmt(voltage, 0, 'kV')}` : ''}${p.region_name ? ` · ${escapeHtml(p.region_name)}` : ''}</div>
    <div class="atlas-grid-access-popup__metrics">
      <span>Available access</span><strong>${fmt(p.available_mw, 0, 'MW')}</strong>
      <span>Allocated / granted</span><strong>${fmt(p.granted_mw, 0, 'MW')}</strong>
      <span>Total offered / access</span><strong>${fmt(p.access_capacity_mw, 0, 'MW')}</strong>
      <span>Queued / contracted</span><strong>${fmt(p.queued_mw, 0, 'MW')}</strong>
      <span>Future projects</span><strong>${fmt(p.project_count)}</strong>
      <span>Earliest target</span><strong>${target}</strong>
      <span>Pressure</span><strong>${pressure != null ? `${fmt(pressure, 1)}%` : 'Not comparable'}</strong>
    </div>${projects}
    <div class="atlas-grid-access-popup__source">Location: ${escapeHtml(p.location_method || '')} · confidence ${confidence != null && confidence >= 0 && confidence <= 1 ? `${Math.round(confidence * 100)}%` : 'Not published'}<br/>Sources: ${escapeHtml(sourceKeys.join(', '))}</div>
    <div class="atlas-grid-access-popup__note">Screening evidence, not a connection offer. Missing values do not mean zero; verify with the source TSO.</div>
  </div>`;
}
