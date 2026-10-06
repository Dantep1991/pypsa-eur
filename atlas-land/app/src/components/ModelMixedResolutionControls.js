import React, { useEffect, useMemo, useState } from 'react';
import { GitBranch, Loader2, RotateCcw } from 'lucide-react';
import ModelControlHelp from './ModelControlHelp';
import ModelMixedModelCreation from './ModelMixedModelCreation';
import ModelRegionalSelection from './ModelRegionalSelection';
import { buildModelResolutionProfile, supportedModelMixedResolutionTiers } from '../modelWorkspace/mixedResolutionPreview';
import './ModelMixedResolutionControls.css';
import { useWorkspaceAgentController, useWorkspaceAgentRegistry } from '../agentWorkspace/react';
import { enumField, numberField, textField } from '../agentWorkspace/registry';

const count = value => Number(value || 0).toLocaleString();
const levelLabel = (index, total) => index === 0 ? 'Focus' : index === total - 1 ? 'Rest of model'
  : index === 1 ? 'Direct neighbours' : `${index === 2 ? '2nd' : '3rd'} neighbour ring`;

export default function ModelMixedResolutionControls({
  countries,
  nativeLabel,
  catalog,
  scene,
  status,
  onApply,
  onClear,
  countryName,
  modelContext,
}) {
  const availableCountries = useMemo(() => [...new Set(countries || [])].sort(), [countries]);
  const [focusCountry, setFocusCountry] = useState(availableCountries[0] || '');
  const [levelCount, setLevelCount] = useState(3);
  const [resolutions, setResolutions] = useState(['native', 'native', 'country', 'country', 'country']);
  const [regional, setRegional] = useState({ schemeId: catalog?.regional_registry?.schemes?.[0]?.id || '', regionIds: [] });
  const supportedTiers = supportedModelMixedResolutionTiers(catalog);
  const tierLabel = tier => tier === 'native' ? `${nativeLabel || 'Model topology'} (native)` : tier === 'bidding_zone' ? 'Bidding Zone' : tier === 'regional' ? 'Regional' : 'Country';
  const regionalSchemeId = regional.schemeId || catalog?.regional_registry?.schemes?.[0]?.id || '';
  useEffect(() => {
    if (!availableCountries.includes(focusCountry)) setFocusCountry(availableCountries[0] || '');
  }, [availableCountries, focusCountry]);
  const preview = status?.preview;
  const profile = preview?.meta?.preview?.profile;
  useEffect(() => {
    if (!profile?.focusCountry) return;
    setFocusCountry(profile.focusCountry);
    setLevelCount(profile.levelCount || 3);
    setResolutions([...(profile.resolutions || ['native', 'native', 'country']), 'country', 'country']);
    setRegional({ schemeId: profile.schemeId || catalog?.regional_registry?.schemes?.[0]?.id || '', regionIds: profile.regionIds || [] });
  }, [profile]);
  const busy = status?.state === 'loading';
  const selectedResolutions = resolutions.slice(0, levelCount).map(tier => supportedTiers.includes(tier) ? tier : 'native');
  const hasRegional = selectedResolutions.includes('regional');
  let regionalCountries = availableCountries;
  if (hasRegional && scene) {
    try {
      const rings = buildModelResolutionProfile(scene, { focusCountry, levelCount,
        resolutions: selectedResolutions.map(tier => tier === 'regional' ? 'native' : tier) });
      regionalCountries = rings.levels.flatMap((level, index) => selectedResolutions[index] === 'regional' ? level.countries : []);
    } catch (_) { regionalCountries = []; }
  }
  const regionalOptions = hasRegional ? { schemeId: regionalSchemeId, regionIds: regional.regionIds } : {};
  const current = profile?.focusCountry === focusCountry && profile.levelCount === levelCount
    && JSON.stringify(profile.resolutions) === JSON.stringify(selectedResolutions)
    && (!hasRegional || (profile.schemeId === regionalSchemeId
      && JSON.stringify([...(profile.regionIds || [])].sort()) === JSON.stringify([...regional.regionIds].sort())));
  const counts = preview?.meta?.preview?.counts;

  const agent = useWorkspaceAgentRegistry();
  const workspaceId = modelContext ? 'mixed_model' : 'mixed_view';
  useWorkspaceAgentController(workspaceId, {
    ready: Boolean(scene && catalog && !busy),
    fields: {
      focusCountry: enumField('Focus country', availableCountries.map(value => ({ value, label: countryName(value) }))),
      levelCount: { ...numberField('Number of levels: focus, neighbour rings, rest', 2, 5), integer: true },
      ...Object.fromEntries([0, 1, 2, 3, 4].map(index => [`tier${index}`, enumField(`Level ${index + 1} granularity (zero = focus; final selected tier = rest)`, supportedTiers)])),
      schemeId: enumField('Regional scheme', (catalog?.regional_registry?.schemes || []).map(row => ({ value: row.id, label: row.name || row.label || row.id }))),
      regionIds: { ...enumField('Regional groups', (catalog?.regional_registry?.schemes || []).flatMap(scheme => scheme.regions.map(row => ({ value: row.id, label: row.name || row.label || row.id, countries: row.countries, schemeId: scheme.id })))), type: 'list' },
      ...(modelContext ? { name: textField('New mixed-resolution model name', 120) } : {}),
    },
    actions: { configure: { description: 'Select focus, level count, each tier granularity and regional groups.' },
      apply: { description: 'Apply the mixed-resolution view to the map.' }, clear: { description: 'Restore native geography.' },
      ...(modelContext ? { preview: { description: 'Apply the mixed view and preview its new complete model schema.' },
        create: { description: 'Review the preview before model publication.', confirmation: true } } : {}) },
    state: { focusCountry, levelCount, ...Object.fromEntries(resolutions.slice(0, 5).map((value, index) => [`tier${index}`, value])),
      schemeId: regionalSchemeId, regionIds: regional.regionIds, loading: busy, error: status?.error,
      applied: Boolean(preview && current), counts, profile },
  }, async (action, values) => {
    if (action === 'clear') { onClear(); return 'Native geography restored.'; }
    const nextCount = values.levelCount || levelCount;
    const nextFocus = values.focusCountry || focusCountry;
    const nextTiers = resolutions.slice(0, nextCount).map((value, index) => values[`tier${index}`] || value);
    const nextScheme = values.schemeId || regionalSchemeId, nextRegions = values.regionIds || regional.regionIds;
    if (nextTiers.includes('regional') && !nextRegions.length) throw new Error('Choose regional groups for the Regional tiers.');
    setFocusCountry(nextFocus); setLevelCount(nextCount); setResolutions([...nextTiers, 'country', 'country', 'country']);
    setRegional({ schemeId: nextScheme, regionIds: nextRegions });
    if (action !== 'configure') {
      onApply(nextFocus, { levelCount: nextCount, resolutions: nextTiers,
        ...(nextTiers.includes('regional') ? { schemeId: nextScheme, regionIds: nextRegions } : {}) });
      const next = await agent.wait(workspaceId, item => item?.ready && (item.state.applied || item.state.error));
      if (next.state.error) throw new Error(next.state.error);
    }
    if (action === 'preview') {
      const creator = await agent.wait('mixed_schema');
      return creator.execute('preview', values.name != null ? { name: values.name } : {});
    }
    return action === 'configure' ? 'Mixed-resolution controls selected.' : 'Mixed-resolution view shown.';
  });
  return (
    <div className="model-mixed-resolution-controls space-y-2.5 rounded-xl border border-white/10 bg-black/20 p-3" aria-label="Mixed-resolution model view">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tj-gold" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-white">Mixed-resolution view</p>
        </div>
        <ModelControlHelp label="Mixed-resolution view">
          <p>Choose 2–5 levels: focus, neighbour rings, and the rest of the model. Neighbours are countries connected by this model’s grid, not geographic proximity. Each ring is one further cross-border connection away.</p>
          <p>No synthetic detail is introduced: country selection never loads another network. Atlas only groups nodes already present in this project version; splitting below native resolution remains unavailable.</p>
          <p>Apply changes to the map first. Use Create model → Mixed resolution to save a separate full schema and PLEXOS XML, with reviewed property rules and complete linked input profiles. Internal transmission constraints are removed: this is a transport aggregation, not an electrically equivalent AC network.</p>
        </ModelControlHelp>
      </div>

      <label className="block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-tj-slate">Focus country inside this model</span>
        <select
          value={focusCountry}
          onChange={event => setFocusCountry(event.target.value)}
          disabled={busy || availableCountries.length < 2}
          className="w-full rounded-lg border border-white/10 bg-[#081523] px-2 py-2 text-[10px] text-white disabled:opacity-50"
          aria-label="Mixed-resolution focus country"
        >
          {availableCountries.map(code => <option key={code} value={code}>{countryName(code)} ({code})</option>)}
        </select>
      </label>

      <label className="block">
        <span className="model-mixed-label">How many levels?</span>
        <select value={levelCount} disabled={busy} aria-label="Mixed-resolution number of levels"
          onChange={event => {
            const nextCount = Number(event.target.value);
            setResolutions(previous => [...previous.slice(0, nextCount - 1), previous[levelCount - 1], 'country', 'country', 'country']);
            setLevelCount(nextCount);
          }}>
          {[2, 3, 4, 5].map(value => <option key={value} value={value}>{value} levels</option>)}
        </select>
      </label>

      <div className="model-mixed-levels">
        {selectedResolutions.map((tier, index) => <label key={index}>
          <span className="model-mixed-label">{levelLabel(index, levelCount)} granularity</span>
          <select value={tier} disabled={busy} aria-label={`${levelLabel(index, levelCount)} granularity`}
            onChange={event => {
              const nextTier = event.target.value;
              setResolutions(previous => previous.map((value, position) => position === index ? nextTier : value));
            }}>
            {supportedTiers.map(value => <option key={value} value={value}>{tierLabel(value)}</option>)}
          </select>
        </label>)}
      </div>

      {hasRegional && <ModelRegionalSelection mixed catalog={catalog} countries={regionalCountries}
        schemeId={regionalSchemeId} regionIds={regional.regionIds} onChange={setRegional} busy={busy} />}
      {hasRegional && !regionalCountries.length && <p role="status">No countries at a Regional level. Choose fewer levels or another focus.</p>}

      {status?.state === 'error' && (
        <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-2 text-[9px] leading-3.5 text-red-200">{status.error}</div>
      )}

      {preview && current && (
        <>
          <div className="model-mixed-summary">
            {profile.levels.map((level, index) => <div key={index}>
              <strong>{count(level.countries.length)}</strong><span>{levelLabel(index, levelCount)}</span>
            </div>)}
          </div>
          <p className="text-[9px] leading-3.5 text-tj-slate">
            {count(counts?.sourceNodes)} mapped source nodes → {count(counts?.projectedNodes)} visible nodes · {count(counts?.sourceLinks)} source links → {count(counts?.projectedLinks)} visible interfaces
          </p>
        </>
      )}
      {preview && !current && <p className="model-mixed-pending" role="status">Settings changed — update view.</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApply(focusCountry, { levelCount, resolutions: selectedResolutions, ...regionalOptions })}
          disabled={busy || !focusCountry || availableCountries.length < 2 || (hasRegional && (!regionalCountries.length
            || !catalog?.regional_registry?.schemes?.find(scheme => scheme.id === regionalSchemeId)?.regions.some(region =>
              regional.regionIds.includes(region.id) && region.countries.some(country => regionalCountries.includes(country)))))}
          className="atlas-primary-action flex-1 rounded-lg border border-tj-gold/40 bg-tj-gold px-3 py-2 text-[10px] font-semibold text-tj-navy-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Projecting…</span> : preview ? 'Update view' : 'Apply mixed view'}
        </button>
        {preview && (
          <button type="button" onClick={onClear} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-2 text-[10px] text-slate-200 hover:bg-white/5 disabled:opacity-40">
            <RotateCcw className="h-3 w-3" />Native model
          </button>
        )}
      </div>
      {modelContext && <ModelMixedModelCreation context={modelContext} profile={profile} current={current} />}
    </div>
  );
}
