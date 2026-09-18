import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config/api';


const INDICATORS = [
  { key: 'density', label: 'Population density', unit: 'people / km²', levels: [2, 3] },
  { key: 'gdp', label: 'GDP per inhabitant', unit: 'PPS', levels: [2, 3] },
  { key: 'employment', label: 'Employment rate', unit: '% · age 20–64', levels: [2] },
  { key: 'unemployment', label: 'Unemployment rate', unit: '% · age 15–74', levels: [2] },
];

const initialWeights = {
  density: 1,
  gdp: 1,
  employment: 1,
  unemployment: 1,
};

const csvCell = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

const downloadAssignments = (result) => {
  const indicators = result?.meta?.indicators || [];
  const rows = result?.assignments || [];
  const lines = [
    ['nuts_id', 'region', 'cluster', ...indicators].map(csvCell).join(','),
    ...rows.map((row) => [
      row.code,
      row.name,
      row.cluster,
      ...indicators.map((indicator) => row.values?.[indicator]),
    ].map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `nohm-atlas-nuts${result.meta.level}-clusters.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
};

export default function RegionalClusteringControls({ countryCodes = [], onOverlayChange }) {
  const [mode, setMode] = useState('multi');
  const [level, setLevel] = useState(2);
  const [year, setYear] = useState(2023);
  const [selected, setSelected] = useState(['density', 'gdp', 'employment']);
  const [weights, setWeights] = useState(initialWeights);
  const [clusterCount, setClusterCount] = useState(4);
  const [scaling, setScaling] = useState('zscore');
  const [opacity, setOpacity] = useState(48);
  const [visible, setVisible] = useState(true);
  const [result, setResult] = useState(null);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('Choose the evidence stack, then build the regional typology.');
  const controllerRef = useRef(null);
  const runIdRef = useRef(0);

  const countryKey = useMemo(
    () => [...new Set(countryCodes.map((code) => String(code).toUpperCase()))].sort().join(','),
    [countryCodes],
  );
  const activeIndicators = useMemo(
    () => (mode === 'single' ? selected.slice(0, 1) : selected),
    [mode, selected],
  );
  const configurationKey = useMemo(() => JSON.stringify({
    countryKey, mode, level, year, selected: activeIndicators,
    weights: activeIndicators.map((key) => weights[key]),
    clusterCount, scaling,
  }), [countryKey, mode, level, year, activeIndicators, weights, clusterCount, scaling]);
  const resultConfigurationKey = result?.configurationKey || '';
  const stale = Boolean(result && resultConfigurationKey !== configurationKey);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!result) return;
    onOverlayChange?.(visible ? {
      key: resultConfigurationKey,
      data: { type: 'FeatureCollection', features: result.features || [] },
      opacity,
      meta: result.meta,
    } : null);
  }, [result, resultConfigurationKey, stale, visible, opacity, onOverlayChange]);

  const changeLevel = (nextLevel) => {
    setLevel(nextLevel);
    const available = selected.filter((key) => (
      INDICATORS.find((indicator) => indicator.key === key)?.levels.includes(nextLevel)
    ));
    setSelected(available.length ? available : ['density']);
  };

  const toggleIndicator = (key) => {
    setSelected((current) => {
      if (mode === 'single') return [key];
      if (current.includes(key)) {
        return current.length > 1 ? current.filter((item) => item !== key) : current;
      }
      return [...current, key];
    });
  };

  const run = async ({ reveal = true, background = false } = {}) => {
    if (!countryKey || !activeIndicators.length) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    setState('loading');
    setMessage(background
      ? 'Updating cluster colours from the revised Eurostat evidence…'
      : 'Joining Eurostat evidence to GISCO regions…');
    const params = new URLSearchParams({
      level: String(level),
      year: String(year),
      countries: countryKey,
      indicators: activeIndicators.join(','),
      weights: activeIndicators.map((key) => `${key}:${weights[key]}`).join(','),
      clusters: String(clusterCount),
      scaling,
    });
    try {
      const response = await fetch(`${API_BASE_URL}/api/atlas/clusters?${params}`, {
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Clustering service returned ${response.status}.`);
      if (runId !== runIdRef.current) return;
      setResult({ ...payload, configurationKey });
      if (reveal) setVisible(true);
      setState('ready');
      setMessage(
        `${Number(payload.meta?.mapped_regions || 0).toLocaleString()} NUTS ${level} regions clustered across ${countryKey.split(',').length} ${countryKey.includes(',') ? 'countries' : 'country'}.`,
      );
    } catch (error) {
      if (controller.signal.aborted || runId !== runIdRef.current) return;
      setState('error');
      const detail = error instanceof Error ? error.message : 'Regional clustering is unavailable.';
      setMessage(background && result
        ? `${detail} Previous cluster colours remain visible.`
        : detail);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  useEffect(() => {
    if (!stale) return undefined;
    if (!countryKey) {
      controllerRef.current?.abort();
      onOverlayChange?.(null);
      setState('idle');
      setMessage('Add at least one country in Geography before building clusters.');
      return undefined;
    }
    controllerRef.current?.abort();
    setState('loading');
    setMessage('Updating cluster colours from the revised Eurostat evidence…');
    const timer = window.setTimeout(() => {
      run({ reveal: false, background: true });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [configurationKey, stale, countryKey]);

  const cancel = () => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState('idle');
    setMessage('Clustering cancelled. Existing map layers were left unchanged.');
  };

  return (
    <div className="space-y-3" data-testid="regional-clustering-controls">
      <div className="rounded-xl border border-tj-gold/20 bg-tj-gold/[0.06] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-white">Regional typology</p>
            <p className="mt-0.5 text-[10px] leading-4 text-tj-slate">
              Live Eurostat indicators, limited to the countries already selected in Geography.
            </p>
          </div>
          {result && (
            <button
              type="button"
              role="switch"
              aria-label="Show regional clusters on map"
              aria-checked={visible}
              onClick={() => setVisible((current) => !current)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                visible
                  ? 'border-tj-gold/50 bg-tj-gold/15 text-tj-gold'
                  : 'border-white/10 bg-black/20 text-tj-slate'
              }`}
              title={visible ? 'Hide cluster overlay' : 'Show cluster overlay'}
            >
              {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {!countryKey && (
        <div role="status" className="rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-2 text-[10px] leading-4 text-amber-100">
          Add at least one country in Geography before building clusters.
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/25 p-1" role="group" aria-label="Clustering analysis mode">
        <button
          type="button"
          aria-pressed={mode === 'single'}
          onClick={() => { setMode('single'); setSelected([selected[0] || 'density']); }}
          className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition ${
            mode === 'single'
              ? 'border-tj-gold/40 bg-tj-gold/10 text-tj-gold'
              : 'border-transparent text-tj-slate hover:text-white'
          }`}
        >
          Single indicator
        </button>
        <button
          type="button"
          aria-pressed={mode === 'multi'}
          onClick={() => setMode('multi')}
          className={`rounded-md border px-2 py-1.5 text-[10px] font-medium transition ${
            mode === 'multi'
              ? 'border-tj-gold/40 bg-tj-gold/10 text-tj-gold'
              : 'border-transparent text-tj-slate hover:text-white'
          }`}
        >
          Weighted stack
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Region level</span>
          <select
            value={level}
            onChange={(event) => changeLevel(Number(event.target.value))}
            className="w-full rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2 text-[11px] text-white focus:border-tj-gold/50 focus:outline-none"
            aria-label="Cluster region level"
          >
            <option value={2}>NUTS 2</option>
            <option value={3}>NUTS 3</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Reference year</span>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            className="w-full rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2 text-[11px] text-white focus:border-tj-gold/50 focus:outline-none"
            aria-label="Cluster reference year"
          >
            <option value={2023}>2023</option>
            <option value={2022}>2022</option>
            <option value={2021}>2021</option>
          </select>
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-[9px] uppercase tracking-wider text-tj-slate">Eurostat evidence</legend>
        {INDICATORS.map((indicator) => {
          const available = indicator.levels.includes(level);
          const checked = selected.includes(indicator.key);
          return (
            <label
              key={indicator.key}
              className={`grid min-h-[48px] grid-cols-[18px_1fr_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                checked && available
                  ? 'border-tj-gold/25 bg-tj-gold/[0.05]'
                  : 'border-white/[0.07] bg-black/10'
              } ${available ? 'cursor-pointer' : 'cursor-not-allowed opacity-35'}`}
            >
              <input
                type={mode === 'single' ? 'radio' : 'checkbox'}
                name="regional-cluster-indicator"
                checked={checked}
                disabled={!available}
                onChange={() => toggleIndicator(indicator.key)}
                className="h-3.5 w-3.5 accent-[#dabd1d]"
              />
              <span className="min-w-0">
                <strong className="block truncate text-[11px] font-medium text-white">{indicator.label}</strong>
                <small className="block truncate text-[9px] text-tj-slate">{indicator.unit}</small>
              </span>
              {mode === 'multi' && checked && available && (
                <select
                  value={weights[indicator.key]}
                  onChange={(event) => setWeights((current) => ({
                    ...current,
                    [indicator.key]: Number(event.target.value),
                  }))}
                  onClick={(event) => event.stopPropagation()}
                  className="h-7 w-[52px] rounded-md border border-white/10 bg-[#081523] px-1 text-[9px] text-white"
                  aria-label={`${indicator.label} influence`}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
              )}
            </label>
          );
        })}
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Clusters</span>
          <input
            type="number"
            min="2"
            max="8"
            value={clusterCount}
            onChange={(event) => setClusterCount(Math.min(8, Math.max(2, Number(event.target.value) || 2)))}
            className="w-full rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2 text-[11px] text-white focus:border-tj-gold/50 focus:outline-none"
            aria-label="Number of regional clusters"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Scaling</span>
          <select
            value={scaling}
            onChange={(event) => setScaling(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2 text-[11px] text-white focus:border-tj-gold/50 focus:outline-none"
            aria-label="Cluster scaling method"
          >
            <option value="zscore">Z-score</option>
            <option value="robust">Robust IQR</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={state === 'loading' ? cancel : () => run()}
        disabled={!countryKey}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
          state === 'loading'
            ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
            : 'border-tj-gold/40 bg-tj-gold text-tj-navy-dark hover:brightness-105'
        }`}
      >
        {state === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {state === 'loading' ? 'Cancel clustering' : 'Build regional clusters'}
      </button>

      <div
        role={state === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={`rounded-lg border px-2.5 py-2 text-[10px] leading-4 ${
          state === 'error'
            ? 'border-red-300/20 bg-red-400/[0.07] text-red-100'
            : 'border-white/[0.07] bg-black/10 text-tj-slate'
        }`}
      >
        {message}
      </div>

      {result && (
        <>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Map opacity</span>
              <select
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="w-full rounded-lg border border-white/10 bg-[#081523] px-2.5 py-2 text-[11px] text-white focus:border-tj-gold/50 focus:outline-none"
                aria-label="Cluster overlay opacity"
              >
                <option value={30}>30%</option>
                <option value={48}>48%</option>
                <option value={65}>65%</option>
                <option value={80}>80%</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => downloadAssignments(result)}
              className="flex h-[35px] items-center gap-1.5 rounded-lg border border-white/15 px-2.5 text-[10px] text-tj-gray transition hover:border-tj-gold/35 hover:text-white"
              title="Export all regional assignments as CSV"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-tj-slate">Cluster profiles</span>
              <span className="text-[9px] text-tj-slate">unscaled means</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {(result.profiles || []).map((profile) => (
                <div key={profile.cluster} className="rounded-lg border border-white/[0.08] bg-black/15 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: profile.color }} />
                    <strong className="text-[10px] text-white">C{profile.cluster}</strong>
                    <span className="ml-auto text-[9px] text-tj-slate">{profile.regions} regions</span>
                  </div>
                  {(result.meta?.indicators || []).slice(0, 2).map((key) => (
                    <p key={key} className="mt-1 flex justify-between gap-2 text-[9px] text-tj-slate">
                      <span className="truncate">{INDICATORS.find((item) => item.key === key)?.label}</span>
                      <b className="shrink-0 font-medium text-tj-gray">
                        {Number(profile.averages?.[key] || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </b>
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <p className="text-[9px] leading-4 text-tj-slate">
            K-means · Euclidean distance · complete cases. Source: Eurostat dissemination API and GISCO NUTS 2024.
          </p>
        </>
      )}
    </div>
  );
}
