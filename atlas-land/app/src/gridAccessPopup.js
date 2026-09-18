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
    ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(148,163,184,.2);"><div style="font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:4px;">Largest mapped projects</div>${samples.map(project => `<div style="margin-top:3px;color:#cbd5e1;">${escapeHtml(project.name || 'Unnamed project')} <span style="color:#94a3b8;">${fmt(project.capacity_mw, 0, 'MW')}${project.target_connection_date ? ` · ${escapeHtml(project.target_connection_date)}` : ''}</span></div>`).join('')}</div>`
    : '';
  const sourceKeys = Array.isArray(p.source_keys) ? p.source_keys : [];
  return `<div style="min-width:245px;max-width:320px;color:#e2e8f0;line-height:1.35;">
    <div style="font-size:13px;font-weight:700;color:#fff;">${escapeHtml(p.name || 'Connection site')}</div>
    <div style="font-size:10px;color:#94a3b8;margin:2px 0 8px;">${escapeHtml(p.side_label || '')}${voltage != null ? ` · ${fmt(voltage, 0, 'kV')}` : ''}${p.region_name ? ` · ${escapeHtml(p.region_name)}` : ''}</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:3px 12px;font-size:10px;">
      <span>Available access</span><strong>${fmt(p.available_mw, 0, 'MW')}</strong>
      <span>Allocated / granted</span><strong>${fmt(p.granted_mw, 0, 'MW')}</strong>
      <span>Total offered / access</span><strong>${fmt(p.access_capacity_mw, 0, 'MW')}</strong>
      <span>Queued / contracted</span><strong>${fmt(p.queued_mw, 0, 'MW')}</strong>
      <span>Future projects</span><strong>${fmt(p.project_count)}</strong>
      <span>Earliest target</span><strong>${target}</strong>
      <span>Pressure</span><strong>${pressure != null ? `${fmt(pressure, 1)}%` : 'Not comparable'}</strong>
    </div>${projects}
    <div style="margin-top:8px;font-size:9px;color:#94a3b8;">Location: ${escapeHtml(p.location_method || '')} · confidence ${confidence != null && confidence >= 0 && confidence <= 1 ? `${Math.round(confidence * 100)}%` : 'Not published'}<br/>Sources: ${escapeHtml(sourceKeys.join(', '))}</div>
    <div style="margin-top:6px;font-size:9px;color:#cbd5e1;">Screening evidence, not a connection offer. Missing values do not mean zero; verify with the source TSO.</div>
  </div>`;
}
