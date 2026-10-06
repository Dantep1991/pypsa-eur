import { enumField, numberField } from './registry';
import { defaultModelResultSelection } from '../modelWorkspace/resultScene';
import { resultMapModes } from '../modelWorkspace/resultPresentation';
import { selectedResultCategories, resultCategorySelection } from '../modelWorkspace/resultCategories';

export function resultWorkspace(catalogStatus, selection, status, scopes, markerScale) {
  const catalog = catalogStatus.catalog;
  const runs = (catalog?.runs || []).filter(run => run.compatible && run.quantities?.length);
  const run = runs.find(item => item.run_id === selection?.runId) || runs[0];
  const quantities = run?.quantities || [];
  return {
    catalog,
    ready: catalogStatus.state === 'ready' && (runs.length > 0 || !catalog?.pending_runs?.length), error: catalogStatus.error,
    fields: {
      runId: enumField('Result run (configure first to load its quantity/category/period choices)', runs.map(item => ({ value: item.run_id, label: item.label,
        periods: item.periods, quantities: item.quantities.map(row => row.id) }))),
      quantityId: enumField('Component and quantity', quantities.map(item => ({ value: item.id,
        label: `${item.class_name} · ${item.property_name} (${item.unit || ''})`, categories: item.categories,
        periods: item.periods, mapModes: resultMapModes(item).map(mode => mode.id) }))),
      category: enumField('Model category', ['', ...new Set(quantities.flatMap(item => item.categories || []))]),
      categories: { ...enumField('Model categories (multiple selections; [] means all)',
        [...new Set(quantities.flatMap(item => item.categories || []))]), type: 'list' },
      period: enumField('Result period', [...new Set(quantities.flatMap(item => item.periods?.length ? item.periods : run?.periods || []))]),
      scopeId: enumField('Node / region', [{ value: '', label: 'All nodes and regions' }, ...(scopes || []).map(item => ({ value: item.id, label: item.label }))]),
      mapMode: enumField('Map style', [...new Map(quantities.flatMap(item => resultMapModes(item)).map(item => [item.id, { value: item.id, label: item.label }])).values()]),
      markerScale: numberField('Circle size multiplier (1 = 100%)', 0.5, 2),
    },
    actions: { show: { description: 'Select and display reported values on the map in one operation.' },
      configure: { description: 'Select a prerequisite run or quantity; continue=true to reload dependent controls.' }, clear: { description: 'Clear the result layer.' } },
    state: { selection, markerScale, status: status.state, error: status.error,
      displayed: status.scene ? { runId: status.scene.run?.run_id, ...status.scene.selection,
        mapped: status.scene.values.length, unit: status.scene.legend?.unit } : null },
  };
}

export function resolveResultSelection(catalog, current, values) {
  const initial = current || defaultModelResultSelection(catalog);
  const run = (catalog?.runs || []).find(item => item.compatible && item.run_id === (values.runId || initial?.runId));
  if (!run) throw new Error('Choose a result run bound to this model version.');
  const quantity = run.quantities.find(item => item.id === (values.quantityId || initial?.quantityId))
    || (!values.quantityId && run.run_id !== current?.runId ? run.quantities[0] : null);
  if (!quantity) throw new Error('That quantity is not reported by the selected run.');
  const changed = run.run_id !== current?.runId || quantity.id !== current?.quantityId;
  const changedClass = quantity.class_name !== (current?.className || run.quantities.find(item => item.id === current?.quantityId)?.class_name);
  if (values.categories !== undefined && values.category !== undefined) throw new Error('Use categories or category, not both.');
  const categories = values.categories ?? (values.category !== undefined ? values.category ? [values.category] : []
    : changedClass ? [] : selectedResultCategories(current).filter(category => !changed || quantity.categories?.includes(category)));
  if (!Array.isArray(categories) || categories.some(category => !quantity.categories?.includes(category)))
    throw new Error('That category is not available for the selected quantity.');
  const periods = quantity.periods?.length ? quantity.periods : run.periods || [];
  const period = values.period || (periods.includes(current?.period) ? current.period : periods[0]);
  if (!periods.includes(period)) throw new Error('That result period is not available.');
  const modes = resultMapModes(quantity);
  const mapMode = values.mapMode || (modes.some(item => item.id === current?.mapMode) ? current.mapMode : modes[0].id);
  if (!modes.some(item => item.id === mapMode)) throw new Error('That map style is not supported for this quantity.');
  return { runId: run.run_id, runLabel: run.label, runModelVersion: run.result_model_version,
    quantityId: quantity.id, className: quantity.class_name, propertyName: quantity.property_name,
    reportFamily: quantity.report_family, unit: quantity.unit, ...resultCategorySelection(categories, quantity),
    period, scopeId: values.scopeId ?? current?.scopeId ?? '', mapMode,
    supportsFlowMap: Boolean(quantity.supports_flow_map), derivedNetFlow: Boolean(quantity.derived_net_flow) };
}
