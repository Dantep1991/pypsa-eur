import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Network, Sparkles } from 'lucide-react';
import { ATLAS_RESOLUTION_LABELS, ATLAS_RESOLUTION_ORDER } from '../atlasAgentCommands';
import { buildMixedGranularityPlan, MIXED_GRANULARITY_DEFAULTS } from '../mixedGranularity';
import { proposeCountryRegions } from '../countryRegionAggregation';

const TIER_OPTIONS = ATLAS_RESOLUTION_ORDER.map((value) => ({
  value,
  label: ATLAS_RESOLUTION_LABELS[value],
}));

export default function MixedGranularityControls({
  countryOptions,
  activeCountryCode,
  activePlan,
  busy,
  onApply,
  facilities = [],
  connections = [],
}) {
  const [expanded, setExpanded] = useState(false);
  const [focusCodes, setFocusCodes] = useState([]);
  const [levels, setLevels] = useState(MIXED_GRANULARITY_DEFAULTS);
  const [scope, setScope] = useState('two_hops');
  const [regions, setRegions] = useState([]);
  const [regionName, setRegionName] = useState('');
  const [regionCodes, setRegionCodes] = useState([]);
  const [aggregationMode, setAggregationMode] = useState('manual');
  const [maxCountries, setMaxCountries] = useState(6);
  const [manualMaxCountries, setManualMaxCountries] = useState(false);
  const [protectNeighbours, setProtectNeighbours] = useState(true);
  const [proposal, setProposal] = useState(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [pendingProposal, setPendingProposal] = useState(null);
  const [pendingProposalReady, setPendingProposalReady] = useState(false);
  const loadingProposalRef = useRef(false);
  useEffect(() => {
    if (!activePlan) return;
    setFocusCodes(activePlan.focusCodes || [activePlan.focusCode]);
    setLevels({ ...MIXED_GRANULARITY_DEFAULTS, ...activePlan.levels });
    setScope(activePlan.scope || 'two_hops');
    setRegions(activePlan.regions || []);
  }, [activePlan]);
  const effectiveFocusCodes = focusCodes.length
    ? focusCodes
    : [activeCountryCode || countryOptions[0]?.countryCode].filter(Boolean);
  const focusKey = effectiveFocusCodes.join(',');
  const levelsKey = Object.keys(levels).sort().map(key => `${key}:${levels[key] || ''}`).join('|');
  const regionsKey = JSON.stringify(regions);
  useEffect(() => {
    // Keep the pending proposal alive while onApply publishes its newly loaded
    // topology. The controls and facility arrays both change during that step.
    if (loadingProposalRef.current) return;
    setProposal(null);
    setProposalError('');
  }, [focusKey, scope, levelsKey, regionsKey, maxCountries, manualMaxCountries, protectNeighbours]);
  useEffect(() => {
    if (!pendingProposal || !pendingProposalReady || busy) return;
    try {
      setProposal(proposeCountryRegions({
        ...pendingProposal,
        facilities,
        connections,
      }));
      setProposalError('');
    } catch (error) {
      setProposalError(error.message || 'Could not propose regions from the loaded network.');
    } finally {
      loadingProposalRef.current = false;
      setPendingProposal(null);
      setPendingProposalReady(false);
      setProposalLoading(false);
    }
  }, [pendingProposal, pendingProposalReady, busy, facilities, connections]);
  const propose = async () => {
    if (busy || proposalLoading) return;
    setProposal(null);
    setProposalError('');
    try {
      const plan = buildMixedGranularityPlan(effectiveFocusCodes,
        countryOptions.map(option => option.countryCode), levels, { scope, regions });
      const countries = plan.countries.map(country => country.countryCode);
      const protectedCountries = [...effectiveFocusCodes, ...(protectNeighbours ? plan.adjacent : [])];
      const maxCountriesLimit = manualMaxCountries ? maxCountries : null;
      const currentTopology = (activePlan?.countries || [])
        .map(({ countryCode, resolution }) => `${countryCode}:${resolution}`).sort();
      const requestedTopology = plan.countries
        .map(({ countryCode, resolution }) => `${countryCode}:${resolution}`).sort();
      const hasCurrentPlan = currentTopology.length === requestedTopology.length
        && currentTopology.every((item, index) => item === requestedTopology[index]);
      const loadedBusCountries = new Set(facilities
        .filter(bus => !bus.is_virtual
          && String(bus.component_type || bus.type).toLowerCase() === 'bus'
          && (bus.atlas_network_carrier == null || bus.atlas_network_carrier === 'electricity'))
        .map(bus => String(bus.sourceCountryCode || bus.country || '').trim().toUpperCase())
        .filter(Boolean));
      const everyCountryHasBuses = countries.every(code => loadedBusCountries.has(code));
      if (!hasCurrentPlan || !everyCountryHasBuses) {
        if (typeof onApply !== 'function') {
          throw new Error('Build the selected mixed view first so Atlas can load its cached buses and interconnector links.');
        }
        loadingProposalRef.current = true;
        setProposalLoading(true);
        setPendingProposal({
          countries,
          maxCountries: maxCountriesLimit,
          protectedCountries,
        });
        setPendingProposalReady(false);
        const loadedPlan = await onApply(effectiveFocusCodes, levels, { scope, regions });
        if (!loadedPlan) throw new Error('Atlas could not load the selected mixed view. Check that a network update is not already in progress.');
        setPendingProposalReady(true);
        return;
      }
      setProposal(proposeCountryRegions({
        countries,
        facilities,
        connections,
        maxCountries: maxCountriesLimit,
        protectedCountries,
      }));
    } catch (error) {
      loadingProposalRef.current = false;
      setPendingProposal(null);
      setPendingProposalReady(false);
      setProposalLoading(false);
      setProposalError(error.message || 'Could not load the selected network for region proposal.');
    }
  };
  const includedCountryCodes = useMemo(() => {
    try {
      const plan = buildMixedGranularityPlan(effectiveFocusCodes,
        countryOptions.map((option) => option.countryCode), levels, { scope });
      return new Set(plan.countries.map(({ countryCode }) => countryCode));
    } catch (_) {
      return new Set();
    }
  }, [effectiveFocusCodes.join(','), countryOptions, levels, scope]);
  const activeSummary = useMemo(() => activePlan ? (
    `${activePlan.focusCodes?.length || 1} focus · ${activePlan.countries?.length ||
      (activePlan.focusCodes?.length || 1) + (activePlan.adjacent?.length || 0) + (activePlan.outer?.length || 0)} countries · ${activePlan.regions?.length || 0} regions`
  ) : '', [activePlan]);
  const updateLevel = (tier, value) => setLevels((previous) => ({ ...previous, [tier]: value }));
  const toggleFocus = (code) => setFocusCodes((previous) => {
    const current = previous.length ? previous : effectiveFocusCodes;
    return current.includes(code) ? (current.length > 1 ? current.filter((item) => item !== code) : current) : [...current, code];
  });
  const toggleRegionCode = (code) => setRegionCodes((previous) => (
    previous.includes(code) ? previous.filter((item) => item !== code) : [...previous, code]
  ));
  const addRegion = () => {
    const name = regionName.trim();
    if (!name || regionCodes.length < 2) return;
    setRegions((previous) => [...previous, { name, countryCodes: [...regionCodes] }]);
    setRegionName('');
    setRegionCodes([]);
  };
  const apply = async () => {
    if (!effectiveFocusCodes.length || busy) return;
    try {
      await onApply(effectiveFocusCodes, levels, { scope, regions });
      setExpanded(false);
    } catch (_) {
      // App owns the visible load error and keeps the previous map intact.
    }
  };

  return (
    <div className={`mt-3 rounded-xl border ${activePlan ? 'border-sky-300/30 bg-sky-300/[0.07]' : 'border-white/10 bg-white/[0.025]'}`}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        disabled={!countryOptions.length || busy}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Network aria-hidden="true" className={`h-4 w-4 shrink-0 ${activePlan ? 'text-sky-300' : 'text-tj-gold'}`} />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-white">Mixed TSO rings</span>
            <span className="block truncate text-[9px] text-slate-300">
              {activePlan ? activeSummary : 'Focus countries · electrical rings · regions'}
            </span>
          </span>
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-tj-gold">{expanded ? 'Close' : activePlan ? 'Edit' : 'Set up'}</span>
      </button>
      {expanded && (
        <div className="space-y-2.5 border-t border-white/10 px-3 py-3">
          <fieldset>
            <legend className="mb-1 text-[9px] uppercase tracking-wider text-slate-300">TSO focus countries</legend>
            <div className="max-h-28 overflow-y-auto rounded-lg border border-white/15 bg-[#081523] p-2">
              {countryOptions.map((option) => (
                <label key={option.countryCode} className="flex items-center gap-2 py-0.5 text-[10px] text-slate-200">
                  <input type="checkbox" checked={effectiveFocusCodes.includes(option.countryCode)}
                    onChange={() => toggleFocus(option.countryCode)} disabled={busy}
                    aria-label={`Focus ${option.countryName}`} />
                  {option.countryName} ({option.countryCode})
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid grid-cols-[1fr_116px] items-center gap-2">
            <span className="text-[10px] text-slate-200">Geographic extent</span>
            <select aria-label="Mixed TSO extent" value={scope} onChange={(event) => setScope(event.target.value)}
              disabled={busy} className="rounded-lg border border-white/15 bg-[#081523] px-2 py-1.5 text-[10px] text-white">
              <option value="two_hops">Two rings</option>
              <option value="three_hops">Three rings</option>
              <option value="full">Full model</option>
            </select>
          </label>
          {[
            ['focus', 'Focus countries'],
            ['adjacent', 'Direct grid neighbours'],
            ['outer', 'Neighbours of neighbours'],
            ...(scope !== 'two_hops' ? [['periphery', 'Third grid ring']] : []),
            ...(scope === 'full' ? [['remaining', 'Remaining model']] : []),
          ].map(([tier, label]) => (
            <label key={tier} className="grid grid-cols-[1fr_116px] items-center gap-2">
              <span className="text-[10px] text-slate-200">{label}</span>
              <select
                aria-label={`${label} resolution`}
                value={levels[tier]}
                onChange={(event) => updateLevel(tier, event.target.value)}
                disabled={busy}
                className="rounded-lg border border-white/15 bg-[#081523] px-2 py-1.5 text-[10px] text-white"
              >
                {TIER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          ))}
          <details className="rounded-lg border border-white/10 px-2 py-1.5">
            <summary className="cursor-pointer text-[10px] font-medium text-slate-200">Aggregate countries into regions ({regions.length})</summary>
            <div className="space-y-2 pt-2">
              <label className="block text-[10px] text-slate-200">Aggregation method
                <select aria-label="Aggregation method" value={aggregationMode} disabled={busy}
                  onChange={event => setAggregationMode(event.target.value)} className="w-full rounded-lg border border-white/15 bg-[#081523] p-2 text-white">
                  <option value="manual">Manual Aggregation</option>
                  <option value="ai">AI Aggregation — topology proposal</option>
                </select>
              </label>
              {aggregationMode === 'ai' && <div className="space-y-2 text-[10px] text-slate-200">
                <p>Automatic mode finds connected topology communities and chooses their size and count. Focus countries stay separate.</p>
                <div className="space-y-1">
                  <span className="block">Maximum countries per region</span>
                  {!manualMaxCountries && <span className="block text-slate-300">Automatic — inferred from grid connectivity</span>}
                  {manualMaxCountries && <label className="block">Manual maximum
                    <input aria-label="Maximum countries per region" type="number" min="2" max="60" value={maxCountries}
                      onChange={event => setMaxCountries(Number(event.target.value))} disabled={busy || proposalLoading} className="w-full bg-[#081523]" />
                  </label>}
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={manualMaxCountries}
                    onChange={event => setManualMaxCountries(event.target.checked)} disabled={busy || proposalLoading} /> Override manually</label>
                </div>
                <label className="block"><input type="checkbox" checked={protectNeighbours}
                  onChange={event => setProtectNeighbours(event.target.checked)} disabled={busy || proposalLoading} /> Keep direct neighbours separate</label>
                <p className="text-[9px] leading-4 text-slate-300">Proposing loads the selected cached country networks first when their buses or links are not on the map yet.</p>
                <button type="button" onClick={propose} disabled={busy || proposalLoading || (manualMaxCountries && (!Number.isInteger(maxCountries) || maxCountries < 2))}
                  className="flex min-h-[40px] w-full items-center justify-center rounded-lg border border-tj-gold/60 bg-tj-gold/15 px-3 py-2 text-xs font-semibold text-tj-gold hover:bg-tj-gold/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tj-gold disabled:cursor-not-allowed disabled:opacity-50">{proposalLoading ? 'Loading buses and links…' : 'Propose regions'}</button>
                {proposalError && <p role="alert" className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[10px] text-rose-100">{proposalError}</p>}
                {proposal && <div role="status" className="space-y-2 rounded-lg border border-white/15 p-3">
                  <p>{proposal.regions.length} regions proposed · country interfaces {proposal.interfacesBefore} → {proposal.interfacesAfter}</p>
                  <p>{proposal.maxCountriesMode === 'automatic'
                    ? `Automatic size: largest proposed region has ${proposal.largestRegionSize} countries.`
                    : `Manual maximum: ${proposal.maxCountriesLimit} countries per region.`}</p>
                  {proposal.regions.map(region => <p key={region.name}>Region: {region.countryCodes.join(' + ')}</p>)}
                  <p>Separate countries: {[...proposal.protectedCountries, ...proposal.groups.filter(group => group.length === 1).flat()].join(', ') || 'None'}</p>
                  {proposal.warnings.map(warning => <p key={warning}>{warning}</p>)}
                  <button type="button" disabled={busy || !proposal.regions.length} className="flex min-h-[40px] w-full items-center justify-center rounded-lg border border-tj-gold/60 bg-tj-gold/15 px-3 py-2 text-xs font-semibold text-tj-gold hover:bg-tj-gold/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tj-gold disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => { setRegions(proposal.regions); setProposal(null); }}>Use proposal (replace staged regions)</button>
                </div>}
              </div>}
              {regions.map((region, index) => (
                <div key={`${region.name}-${index}`} className="flex items-center justify-between gap-2 text-[10px] text-slate-200">
                  <span>{region.name}: {region.countryCodes.join(' + ')}</span>
                  <button type="button" onClick={() => setRegions((previous) => previous.filter((_, i) => i !== index))}
                    disabled={busy} aria-label={`Remove region ${region.name}`} className="text-tj-gold">Remove</button>
                </div>
              ))}
              <input value={regionName} onChange={(event) => setRegionName(event.target.value)}
                aria-label="Region name" placeholder="Region name, e.g. Benelux" disabled={busy}
                className="w-full rounded-lg border border-white/15 bg-[#081523] px-2 py-1.5 text-[10px] text-white" />
              <div className="max-h-24 overflow-y-auto rounded-lg border border-white/15 bg-[#081523] p-2">
                {countryOptions.filter((option) => includedCountryCodes.has(option.countryCode)
                  && !effectiveFocusCodes.includes(option.countryCode)
                  && !regions.some((region) => region.countryCodes.includes(option.countryCode)))
                  .map((option) => (
                    <label key={option.countryCode} className="flex items-center gap-2 py-0.5 text-[10px] text-slate-200">
                      <input type="checkbox" checked={regionCodes.includes(option.countryCode)}
                        onChange={() => toggleRegionCode(option.countryCode)} disabled={busy}
                        aria-label={`Add ${option.countryName} to region`} />
                      {option.countryName} ({option.countryCode})
                    </label>
                  ))}
              </div>
              <button type="button" onClick={addRegion} disabled={busy || !regionName.trim() || regionCodes.length < 2}
                className="text-[10px] font-semibold text-tj-gold disabled:opacity-50">Add region</button>
              <p className="text-[9px] text-slate-300">Region markers and links are visual aggregations of cached bidding-zone networks, not executable model topology.</p>
              <p className="text-[9px] text-slate-300">Only countries inside the chosen geographic extent are listed.</p>
            </div>
          </details>
          <p className="text-[9px] leading-4 text-slate-300">
            Rings follow transmission interconnections, including relevant subsea links. The complete view is published only after every local cache is ready.
          </p>
          <button
            type="button"
            onClick={apply}
            disabled={!effectiveFocusCodes.length || busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-tj-gold/40 bg-tj-gold/10 px-3 py-2 text-[10px] font-semibold text-tj-gold hover:bg-tj-gold/15 disabled:opacity-50"
          >
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            {busy ? 'Building mixed view…' : 'Build mixed view'}
          </button>
        </div>
      )}
    </div>
  );
}
