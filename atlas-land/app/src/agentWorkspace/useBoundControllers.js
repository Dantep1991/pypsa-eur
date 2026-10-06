import { useWorkspaceAgentController } from './react';
import { boolField, enumField, numberField } from './registry';
import { cbaBands, cbaComponents, defaultCbaSelection } from '../modelWorkspace/cbaScene';

// Controllers share the existing UI callbacks; no second data/solver path.
export default function useBoundControllers({ registry, model, scope, selectCountries, applyCountryResolution,
  display, setters, setDomains, reset, openLand, openAccess, cba, prepareCba }) {
  const countries = model?.sourceCountries || [];
  useWorkspaceAgentController('country_scope', {
    ready: Boolean(model?.modelVersion), fields: { countries: { ...enumField('Countries (empty = all project countries)', countries), type: 'list' },
      resolution: enumField('Granularity of named countries only; omit to preserve', model?.resolutions || ['native']) },
    actions: { show: { description: 'Replace country scope; optional resolution applies to named countries. Preserve other countries\' granularity.' },
      add: { description: 'Add countries to current scope, optionally at their requested resolution.' },
      remove: { description: 'Remove only named countries, preserving current geography.' } },
    state: { countries: scope, resolution: display.resolution, resolutionsByCountry: display.resolutionsByCountry },
  }, async (action, values) => {
    if (values.resolution) await applyCountryResolution(values.countries?.length ? values.countries : countries, values);
    const selected = action === 'add' ? [...new Set([...(scope.length ? scope : countries), ...(values.countries || [])])]
      : action === 'remove' ? (scope.length ? scope : countries).filter(code => !values.countries?.includes(code))
        : values.countries ?? scope;
    if (action === 'remove' && !selected.length) throw new Error('Removing every country would leave an empty map.');
    await selectCountries(selected);
    return values.countries?.length ? `${values.countries.join(', ')} selected.` : 'All project countries shown.';
  }, registry);
  useWorkspaceAgentController('display', {
    ready: Boolean(model?.modelVersion),
    fields: { layers: { ...enumField('Visible layers', ['Grid', 'Storage', 'Supply', 'Demand']), type: 'list' },
      nodes: boolField('Node dots'), bubbles: boolField('Data bubbles'), boundaries: boolField('Geographic boundaries'),
      disabledLinks: boolField('Disabled links'), pies: boolField('Generation mix pies'),
      pieSize: numberField('Pie size multiplier (1 = 100%)', .5, 2) },
    actions: { show: { description: 'Set the map display controls, preserving omitted fields.' },
      reset: { description: 'Reset the display to defaults, clearing visual overlays without changing the saved model.' },
      land: { description: 'Open Land and constraints.' }, access: { description: 'Open Grid access.' } },
    state: display,
  }, async (action, values) => {
    if (action === 'reset') { reset(); return 'Map display reset.'; }
    if (action === 'land') { openLand(); return 'Land controls opened.'; }
    if (action === 'access') { openAccess(); return 'Access controls opened.'; }
    if (values.layers != null) await setDomains(values.layers, 'replace');
    for (const [key, setter] of Object.entries(setters)) if (values[key] != null) setter(values[key]);
    return 'Map display updated.';
  }, registry);
  const study = cba.catalog.studies.find(item => item.projectId === cba.selection?.studyId);
  const components = cbaComponents(study, cba.selection?.caseId, cba.selection?.band);
  useWorkspaceAgentController('cba', {
    ready: cba.catalog.state === 'ready', error: cba.catalog.error,
    fields: { studyId: enumField('Theo study', cba.catalog.studies.map(row => ({ value: row.projectId, label: row.name }))),
      caseId: enumField('Assessed project', study?.cases || []), band: enumField('Scenario / year', cbaBands(study, cba.selection?.caseId)),
      component: enumField('Value', components.map(row => ({ value: row.id, label: row.label, enabled: row.available }))),
      map: enumField('Visualisation', [{ value: 'country', label: 'Country value map' },
        { value: 'connections', label: 'Congestion rent map', enabled: Boolean(components.find(row => row.id === 'congestion')?.available) }]),
      markerScale: numberField('Circle size multiplier (1 = 100%)', .5, 2) },
    actions: { show: { description: 'Show assessed CBA values on the map.' },
      configure: { description: 'Select prerequisite study/case before its value catalogue.' }, clear: { description: 'Clear CBA map layer.' } },
    state: { ...cba.selection, markerScale: cba.markerScale, loading: cba.status.state === 'loading', error: cba.status.error,
      displayed: cba.scene ? { mapped: cba.scene.coverage.mapped, study: cba.scene.studyId, selection: cba.scene.selection } : null },
  }, async (action, values) => {
    if (action === 'clear') { cba.clear(); return 'CBA layer cleared.'; }
    const nextStudy = cba.catalog.studies.find(item => item.projectId === (values.studyId || study?.projectId));
    const next = { ...(nextStudy === study ? cba.selection : defaultCbaSelection(nextStudy)), ...values };
    const allowed = cbaComponents(nextStudy, next.caseId, next.band).find(item => item.id === next.component);
    if (!allowed?.available) throw new Error('That value was not assessed for this project and scenario.');
    if (next.map === 'connections' && next.component !== 'congestion') throw new Error('Connection rent maps require Congestion rents.');
    delete next.markerScale;
    cba.clear(); cba.setSelection(next);
    if (values.markerScale != null) cba.setMarkerScale(values.markerScale);
    if (action === 'configure') return 'CBA controls selected.';
    const result = await cba.show(prepareCba, next);
    if (!result?.coverage?.mapped) throw new Error('The selected assessed values could not be mapped.');
    await registry.wait('cba', item => !item?.state.loading && item?.state.displayed?.selection?.caseId === next.caseId
      && item.state.displayed.selection.band === next.band && item.state.displayed.selection.component === next.component);
    return `${result.coverage.mapped} assessed CBA values shown.`;
  }, registry);
}
