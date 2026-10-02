import { escapeMapText as escapeHtml, publishedNumber } from "./mapText";

// Shared, escaped content for the tabbed sidebar and legacy popup consumers.
let popupCardSequence = 0;
export const buildGeoJsonPopupContent = (facility, section = null) => {
  if (!facility) return '<div style="font-size:12px;color:var(--atlas-map-text);">No details</div>';
  const toNumber = (v) => {
    return publishedNumber(typeof v === 'string' ? v.replace(/,/g, '') : v);
  };
  const formatNum = (v, digits = 2) => {
    const n = toNumber(v);
    if (n == null) return '—';
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
  };
  const getRows = (item) => Array.isArray(item?.properties) ? item.properties : [];
  const findProp = (rows, keys = []) => {
    for (const row of rows) {
      const k = String(row?.Property || '').trim().toLowerCase();
      if (!k) continue;
      if (keys.some((key) => k === String(key).trim().toLowerCase())) return row;
    }
    return null;
  };
  const contextRows = (rows) => rows
    .filter((r) => String(r?.Property || '').startsWith('[Context]'))
    .map((r) => ({
      key: String(r?.Property || '').replace('[Context] ', ''),
      value: r?.Value,
      units: r?.Units || '',
    }))
    .filter((r) => r.key && r.value !== '' && r.value != null);

  const kpiCard = (label, value, unit, tone = 'blue') => {
    const tones = {
      blue: { ring: 'var(--accent-primary-text)', halo: 'var(--accent-primary-transparent)', fg: 'var(--atlas-map-text)' },
      amber: { ring: 'var(--accent-primary-text)', halo: 'var(--accent-primary-transparent)', fg: 'var(--atlas-map-text)' },
      emerald: { ring: 'var(--accent-primary-text)', halo: 'var(--accent-primary-transparent)', fg: 'var(--atlas-map-text)' },
    };
    const t = tones[tone] || tones.blue;
    const txt = String(value == null ? '—' : value).trim();
    return `
      <div style="flex:1;min-width:0;padding:10px 5px;border:1px solid var(--accent-primary-transparent);border-radius:8px;background:${t.halo};text-align:center;">
        <div style="font-size:16px;font-weight:700;color:${t.fg};line-height:1.2;overflow-wrap:anywhere;">${escapeHtml(txt)}</div>
        ${unit ? `<div style="font-size:10px;color:var(--atlas-map-muted);margin-top:3px;">${escapeHtml(unit)}</div>` : ''}
        <div style="font-size:10px;color:var(--atlas-map-muted);margin-top:5px;">${escapeHtml(label)}</div>
      </div>
    `;
  };

  const barRow = (label, value, maxValue, color = 'var(--accent-primary-text)', suffix = '', digits = 1) => {
    const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
    const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
    const pct = Math.max(3, Math.min(100, (safeVal / safeMax) * 100));
    return `
      <div style="margin-top:4px;">
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--atlas-map-muted);">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56%;">${escapeHtml(label)}</span>
          <span>${escapeHtml(formatNum(safeVal, digits))}${suffix ? ` ${escapeHtml(suffix)}` : ''}</span>
        </div>
        <div style="margin-top:3px;height:5px;border-radius:999px;background:var(--panel-surface-soft);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:999px;"></div>
        </div>
      </div>
    `;
  };

  const formatDemandValue = (value, unit = '') => {
    const numeric = toNumber(value);
    if (numeric == null) return '—';
    const magnitude = Math.abs(numeric);
    const digits = magnitude >= 10 ? 2 : magnitude >= 0.1 ? 3 : magnitude >= 0.001 ? 4 : 6;
    const rendered = numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
    return unit ? `${rendered} ${unit}` : rendered;
  };

  const renderDemandBreakdown = (item) => {
    const sectors = Array.isArray(item?.demand_breakdown) ? item.demand_breakdown : [];
    if (!sectors.length) return item?.provisional_demand
      ? '<p style="margin-top:8px;color:var(--accent-primary-text);font-size:11px;">Sector/subsector breakdown unavailable for this country. Provisional total demand is still shown.</p>'
      : '';
    const sectorColors = {
      Residential: 'var(--accent-primary-text)',
      Tertiary: 'var(--accent-primary-text)',
      Industry: 'var(--accent-primary-text)',
      Transport: 'var(--accent-primary-text)',
    };
    const explicitTotal = sectors.reduce((sum, sector) => sum + Math.max(0, Number(sector?.annual_energy_gwh) || 0), 0);
    const total = Math.max(0, Number(item?.annual_energy_gwh) || explicitTotal) || 1;
    return `
      <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--panel-surface-soft);">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <div style="font-size:10px;color:var(--atlas-map-muted);text-transform:uppercase;letter-spacing:.04em;">Demand composition</div>
          <div style="font-size:10px;color:var(--atlas-map-muted);">${escapeHtml(item?.demand_scenario || '')}${item?.demand_year ? ` · ${escapeHtml(item.demand_year)}` : ''}</div>
        </div>
        ${sectors.map((sector) => {
          const name = String(sector?.name || 'Other');
          const sectorShare = Math.max(0, Number(sector?.share) || 0);
          const annual = sector?.annual_energy_gwh != null
            ? Math.max(0, Number(sector.annual_energy_gwh) || 0)
            : total * sectorShare;
          const share = sectorShare > 0 ? sectorShare * 100 : (total > 0 ? (annual / total) * 100 : 0);
          const color = sectorColors[name] || 'var(--atlas-map-muted)';
          const subsectors = Array.isArray(sector?.subsectors) ? sector.subsectors : [];
          return `
            <details style="margin-top:6px;">
              <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--atlas-map-text);">
                <span style="width:8px;height:8px;border-radius:2px;background:${color};display:inline-block;"></span>
                <span style="flex:1;">${escapeHtml(name)}</span>
                <span style="color:var(--atlas-map-muted);">${share.toFixed(1)}% · ${escapeHtml(formatDemandValue(annual, 'GWh'))}</span>
              </summary>
              ${subsectors.map((subsector) => {
                const subsectionAnnual = subsector?.annual_energy_gwh != null
                  ? Math.max(0, Number(subsector.annual_energy_gwh) || 0)
                  : total * Math.max(0, Number(subsector?.share_of_total) || 0);
                return `
                <div style="display:flex;justify-content:space-between;gap:8px;margin:3px 0 0 14px;font-size:10px;color:var(--atlas-map-muted);">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65%;">${escapeHtml(subsector?.name || 'Other')}</span>
                  <span>${escapeHtml(formatDemandValue(subsectionAnnual, 'GWh'))}</span>
                </div>
              `;}).join('')}
            </details>
          `;
        }).join('')}
      </div>
    `;
  };

  const renderOverview = (item, locationItems) => {
    const rows = getRows(item);
    const isDemand = String(item?.component_type || item?.type || '').toLowerCase() === 'load'
      || Boolean(item?.provisional_demand);
    const pNom = findProp(rows, ['P Nom Optimal', 'P Nom', 'E Nom'])
      || (toNumber(item.p_nom_opt ?? item.p_nom) !== null ? { Value: item.p_nom_opt ?? item.p_nom, Units: 'MW' } : null)
      || (toNumber(item.e_nom) !== null ? { Value: item.e_nom, Units: 'MWh' } : null);
    const marginal = findProp(rows, ['Marginal Cost', '[Context] Cost Marginal']);
    const demandAvg = findProp(rows, ['[Context] Demand Avg', 'P Set']);
    const annualDemand = findProp(rows, ['Annual allocation']);
    const spatialWeight = findProp(rows, ['Spatial weight']);
    // Prefer the unrounded payload fields. The generic property table stores
    // P Set at two decimals, which turns many valid small allocations into 0.00.
    const demandAvgValue = item?.p_set != null ? item.p_set : demandAvg?.Value;
    const demandAvgUnit = item?.p_set != null ? 'MW' : (demandAvg?.Units || '');
    const annualDemandValue = item?.annual_energy_gwh != null ? item.annual_energy_gwh : annualDemand?.Value;
    const annualDemandUnit = item?.annual_energy_gwh != null ? 'GWh' : (annualDemand?.Units || '');
    const spatialWeightValue = item?.spatial_weight != null
      ? Number(item.spatial_weight) * 100
      : spatialWeight?.Value;
    const corePairs = [
      ['Type', item.component_type || item.type || '—'],
      ['Carrier', item.carrier_nice_name || item.carrier || '—'],
      ['Bus', item.bus || '—'],
      ['Country', item.country || '—'],
    ];
    const carrierCounts = {};
    for (const x of locationItems) {
      const ck = String(x?.carrier_nice_name || x?.carrier || x?.type || 'unknown');
      carrierCounts[ck] = (carrierCounts[ck] || 0) + 1;
    }
    const mixRows = Object.entries(carrierCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const mixMax = Math.max(1, ...mixRows.map(([, c]) => c));

    const cbcCountries = {};
    for (const row of rows) {
      const key = String(row?.Property || '');
      if (/^\[CBC \d+\] Foreign Country$/i.test(key) || /^\[Link \d+\] Foreign Country$/i.test(key)) {
        const cc = String(row?.Value || '').trim();
        if (cc) cbcCountries[cc] = (cbcCountries[cc] || 0) + 1;
      }
    }
    const cbcRows = Object.entries(cbcCountries).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const cbcMax = Math.max(1, ...cbcRows.map(([, c]) => c));

    return `
      ${isDemand && item?.provisional_demand ? '<p style="margin:0 0 10px;padding:7px 9px;border:1px solid var(--accent-primary-transparent);border-radius:6px;color:var(--accent-primary-text);font-size:11px;line-height:1.4;">Provisional estimate, not measured consumption. Flat 8,760-hour profile.</p>' : ''}
      <div style="display:flex;gap:6px;margin-top:2px;">
        ${isDemand
          ? kpiCard('Annual demand', formatDemandValue(annualDemandValue), annualDemandUnit, 'blue')
          : kpiCard('Capacity', pNom?.Value ?? '—', pNom?.Units || '', 'blue')}
        ${kpiCard('Avg demand', isDemand ? formatDemandValue(demandAvgValue) : (demandAvg?.Value ?? '—'), demandAvgUnit, 'emerald')}
        ${isDemand
          ? kpiCard('Spatial share', formatDemandValue(spatialWeightValue), spatialWeightValue != null ? '%' : '', 'amber')
          : kpiCard('Marginal', marginal?.Value ?? '—', marginal?.Units || '', 'amber')}
      </div>

      <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--panel-surface-soft);">
        ${corePairs.map(([k, v]) => `
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--atlas-map-text);">
            <span style="color:var(--atlas-map-muted);">${escapeHtml(k)}</span><span style="text-align:right;">${escapeHtml(v)}</span>
          </div>`).join('')}
      </div>

      ${mixRows.length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--panel-surface-soft);">
          <div style="font-size:10px;color:var(--atlas-map-muted);text-transform:uppercase;letter-spacing:.04em;">Carrier mix at location</div>
          ${mixRows.map(([label, count]) => barRow(label, count, mixMax, 'var(--accent-primary-text)', 'comp')).join('')}
        </div>
      ` : ''}

      ${isDemand ? renderDemandBreakdown(item) : ''}

      ${cbcRows.length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--panel-surface-soft);">
          <div style="font-size:10px;color:var(--atlas-map-muted);text-transform:uppercase;letter-spacing:.04em;">Interconnectors</div>
          ${cbcRows.map(([label, count]) => barRow(label, count, cbcMax, 'var(--accent-primary-text)', 'links')).join('')}
        </div>
      ` : ''}
    `;
  };

  const renderCosts = (item) => {
    const rows = getRows(item);
    const contexts = contextRows(rows).filter((r) => /cost|technology|lifetime|efficiency/i.test(r.key));
    const directRows = [
      findProp(rows, ['Capital Cost']),
      findProp(rows, ['Marginal Cost']),
      findProp(rows, ['Efficiency']),
      findProp(rows, ['Lifetime']),
    ].filter(Boolean);
    const csvSources = item?.csv_context_sources?.files || {};
    const csvMatched = Array.isArray(item?.csv_context_sources?.matched) ? item.csv_context_sources.matched : [];
    const merged = [
      ...contexts.map((r) => ({ key: r.key, value: r.value, units: r.units })),
      ...directRows.map((r) => ({ key: r.Property, value: r.Value, units: r.Units || '' })),
    ];
    if (!merged.length && !Object.keys(csvSources).length) {
      return '<div style="font-size:12px;color:var(--atlas-map-muted);">No cost context available for this component.</div>';
    }
    return `
      <div>
        ${merged.slice(0, 12).map((r) => `
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--atlas-map-text);">
            <span style="color:var(--atlas-map-muted);">${escapeHtml(r.key)}</span>
            <span style="text-align:right;">${escapeHtml(r.value)}${r.units ? ` ${escapeHtml(r.units)}` : ''}</span>
          </div>
        `).join('')}
      </div>
      ${Object.keys(csvSources).length > 0 ? `
        <div style="margin-top:8px;padding-top:7px;border-top:1px solid var(--panel-surface-soft);">
          <div style="font-size:10px;color:var(--atlas-map-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Sources</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${Object.entries(csvSources).map(([k, v]) => {
              const matched = csvMatched.includes(k);
              const fg = matched ? 'var(--atlas-map-text)' : 'var(--atlas-map-muted)';
              const bg = matched ? 'var(--accent-primary-transparent)' : 'var(--panel-surface-soft)';
              const br = matched ? 'var(--accent-primary-transparent)' : 'var(--panel-surface-soft)';
              return `<span title="${escapeHtml(v || '')}" style="font-size:10px;color:${fg};border:1px solid ${br};background:${bg};padding:2px 6px;border-radius:999px;">${escapeHtml(k)}</span>`;
            }).join('')}
          </div>
        </div>
      ` : ''}
    `;
  };

  const renderTimeSeries = (item) => {
    const rows = getRows(item);
    const avg = findProp(rows, ['[Context] Demand Avg']);
    const peak = findProp(rows, ['[Context] Demand Peak']);
    const latest = findProp(rows, ['[Context] Demand Latest']);
    const values = [
      { label: 'Average', row: avg, color: 'var(--accent-primary-text)' },
      { label: 'Peak', row: peak, color: 'var(--accent-primary-text)' },
      { label: 'Latest', row: latest, color: 'var(--accent-primary-text)' },
    ].filter((x) => x.row);
    if (!values.length) {
      const provisionalAverage = toNumber(item?.p_set);
      if (Boolean(item?.provisional_demand) && provisionalAverage != null) {
        return `
          <div style="font-size:11px;color:var(--atlas-map-muted);margin-bottom:5px;">Provisional flat profile</div>
          ${barRow('Every hour', provisionalAverage, Math.max(provisionalAverage, 1e-9), 'var(--accent-primary-text)', 'MW', 6)}
          <div style="margin-top:8px;font-size:10px;color:var(--atlas-map-muted);">The current placeholder repeats this average value for all 8,760 hours. It will be replaced when the NUTS3 hourly demand input is connected.</div>
        `;
      }
      return '<div style="font-size:12px;color:var(--atlas-map-muted);">No demand time-series summary available for this component.</div>';
    }
    const maxVal = Math.max(1, ...values.map((x) => toNumber(x.row?.Value) || 0));
    const unit = values[0]?.row?.Units || '';
    return `
      <div style="font-size:11px;color:var(--atlas-map-muted);margin-bottom:5px;">Demand summary (${escapeHtml(unit || 'MW')})</div>
      ${values.map((x) => barRow(x.label, toNumber(x.row?.Value) || 0, maxVal, x.color, unit)).join('')}
      <div style="margin-top:8px;font-size:10px;color:var(--atlas-map-muted);">Summary of the available demand context; this is not a full hourly profile.</div>
    `;
  };

  const renderTabbedCard = (item, locationItems, includeTitle = true) => {
    const name = escapeHtml(item.name || item.id || 'Component');
    const tabs = ['overview', 'costs', 'time'];
    const labels = { overview: 'Overview', costs: 'Costs', time: 'Time-series' };
    const card = document.createElement('div');
    card.style.minWidth = '0';
    card.style.maxWidth = '100%';
    card.style.lineHeight = '1.35';
    if (includeTitle) {
      const ttl = document.createElement('div');
      ttl.style.fontWeight = '700';
      ttl.style.fontSize = '13px';
      ttl.style.color = 'var(--atlas-map-text)';
      ttl.style.marginBottom = '6px';
      ttl.textContent = name;
      card.appendChild(ttl);
    }

    const chipWrap = document.createElement('div');
    chipWrap.style.display = 'flex';
    chipWrap.style.gap = '6px';
    chipWrap.style.flexWrap = 'wrap';
    chipWrap.style.marginBottom = '8px';
    const mkChip = (txt, fg, bg, br) => `<span style="font-size:10px;color:${fg};background:${bg};border:1px solid ${br};padding:2px 6px;border-radius:999px;">${escapeHtml(txt)}</span>`;
    chipWrap.innerHTML = [
      mkChip(item.component_type || item.type || '—', 'var(--atlas-map-text)', 'var(--accent-primary-transparent)', 'var(--accent-primary-transparent)'),
      mkChip(item.carrier_nice_name || item.carrier || '—', 'var(--atlas-map-text)', 'var(--accent-primary-transparent)', 'var(--accent-primary-transparent)'),
      mkChip(item.country || '—', 'var(--atlas-map-muted)', 'var(--accent-primary-transparent)', 'var(--accent-primary-transparent)'),
    ].join('');
    card.appendChild(chipWrap);

    const tabsWrap = document.createElement('div');
    tabsWrap.style.display = 'grid';
    tabsWrap.style.gridTemplateColumns = '1fr 1fr 1fr';
    tabsWrap.style.gap = '4px';
    tabsWrap.style.background = 'var(--panel-surface-soft)';
    tabsWrap.style.padding = '3px';
    tabsWrap.style.border = '1px solid var(--panel-surface-soft)';
    tabsWrap.style.borderRadius = '10px';

    const panel = document.createElement('div');
    const cardId = `atlas-asset-card-${++popupCardSequence}`;
    tabsWrap.setAttribute('role', 'tablist');
    tabsWrap.setAttribute('aria-label', 'Component details');
    panel.id = `${cardId}-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.tabIndex = 0;
    panel.style.marginTop = '8px';
    panel.style.border = '1px solid var(--panel-surface-soft)';
    panel.style.borderRadius = '10px';
    panel.style.padding = '8px';
    panel.style.background = 'var(--control-surface)';

    let active = 'overview';
    const renderPanel = () => {
      if (active === 'overview') panel.innerHTML = renderOverview(item, locationItems);
      else if (active === 'costs') panel.innerHTML = renderCosts(item);
      else panel.innerHTML = renderTimeSeries(item);
      Array.from(tabsWrap.children).forEach((node) => {
        const isActive = node.getAttribute('data-tab') === active;
        node.setAttribute('aria-selected', String(isActive));
        node.tabIndex = isActive ? 0 : -1;
        if (isActive) panel.setAttribute('aria-labelledby', node.id);
        node.style.background = isActive ? 'var(--panel-surface-soft)' : 'transparent';
        node.style.color = isActive ? 'var(--atlas-map-text)' : 'var(--atlas-map-muted)';
        node.style.borderColor = isActive ? 'var(--panel-surface-soft)' : 'transparent';
      });
    };

    tabs.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = `${cardId}-${t}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', panel.id);
      btn.setAttribute('data-tab', t);
      btn.style.fontSize = '11px';
      btn.style.padding = '5px 0';
      btn.style.borderRadius = '7px';
      btn.style.border = '1px solid transparent';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all .12s ease';
      btn.textContent = labels[t];
      btn.addEventListener('click', () => {
        active = t;
        renderPanel();
      });
      btn.addEventListener('keydown', (event) => {
        const index = tabs.indexOf(t);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next == null) return;
        event.preventDefault();
        event.stopPropagation(); // Navigation within the popup must not pan the map.
        active = tabs[next];
        renderPanel();
        tabsWrap.children[next].focus();
      });
      tabsWrap.appendChild(btn);
    });
    card.appendChild(tabsWrap);
    card.appendChild(panel);
    renderPanel();
    return card;
  };

  const sameLocation = Array.isArray(facility.sameLocationFacilities) ? facility.sameLocationFacilities : [];
  const facilityId = String(facility?.id || '');
  const locationItems = sameLocation.length > 0
    ? [facility, ...sameLocation.filter((item) => String(item?.id || '') !== facilityId)]
    : [facility];
  if (section === "overview") return renderOverview(facility, locationItems);
  if (section === "costs") return renderCosts(facility);
  if (section === "time") return renderTimeSeries(facility);
  if (typeof document === 'undefined') {
    return `<div style="min-width:250px;line-height:1.35;">${escapeHtml(facility.name || facility.id || 'Component')}</div>`;
  }

  const root = document.createElement('div');
  root.style.minWidth = '0';
  root.style.width = 'min(350px, calc(100vw - 72px))';
  root.style.maxWidth = '100%';
  root.style.lineHeight = '1.35';

  const heading = document.createElement('div');
  heading.style.fontWeight = '700';
  heading.style.fontSize = '14px';
  heading.style.color = 'var(--atlas-map-text)';
  heading.textContent = String(facility.bus || facility.name || facility.id || 'Location');
  root.appendChild(heading);

  const sub = document.createElement('div');
  sub.style.fontSize = '11px';
  sub.style.color = 'var(--atlas-map-muted)';
  sub.style.marginTop = '2px';
  sub.textContent = `${locationItems.length} component${locationItems.length > 1 ? 's' : ''} at this location`;
  root.appendChild(sub);

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Component at this location');
  select.style.marginTop = '8px';
  select.style.width = '100%';
  select.style.padding = '6px 8px';
  select.style.borderRadius = '8px';
  select.style.border = '1px solid var(--panel-surface-soft)';
  select.style.background = 'var(--control-surface)';
  select.style.color = 'var(--atlas-map-text)';
  select.style.fontSize = '12px';
  locationItems.forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${item.carrier_nice_name || item.carrier || item.type || 'Component'} • ${item.component_type || item.type || ''}`;
    select.appendChild(opt);
  });
  if (locationItems.length > 1) root.appendChild(select);

  const panelHolder = document.createElement('div');
  panelHolder.style.marginTop = '8px';
  root.appendChild(panelHolder);

  const renderCurrent = () => {
    panelHolder.innerHTML = '';
    const idx = Math.max(0, Math.min(locationItems.length - 1, Number(select.value || 0)));
    const selected = locationItems[idx];
    panelHolder.appendChild(renderTabbedCard(selected, locationItems, false));
  };
  select.addEventListener('input', renderCurrent);
  select.addEventListener('change', renderCurrent);
  renderCurrent();
  return root;
};


