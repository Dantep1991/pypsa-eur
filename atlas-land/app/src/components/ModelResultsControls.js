import React, { useEffect, useRef } from 'react';
import { BarChart3, CheckCircle2, Loader2, X } from 'lucide-react';
import { resultMapModes } from '../modelWorkspace/resultPresentation';
import './ModelResultsControls.css';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import { selectedResultCategories, resultCategorySelection, retainResultCategories } from '../modelWorkspace/resultCategories';

const quantityLabel = quantity => `${quantity.class_name} · ${quantity.property_name}${quantity.unit ? ` (${quantity.unit})` : ''}`;

export default function ModelResultsControls({
  catalogStatus,
  selection,
  resultStatus,
  scopeOptions = [],
  onSelectionChange,
  onShow,
  onClear,
  markerScale,
  onMarkerScaleChange,
}) {
  const catalog = catalogStatus?.catalog;
  const compatibleRuns = (catalog?.runs || []).filter(run => run.compatible && run.quantities?.length);
  const run = compatibleRuns.find(item => item.run_id === selection?.runId) || compatibleRuns[0];
  const allQuantities = run?.quantities || [];
  const componentClasses = [...new Set(allQuantities.map(item => item.class_name).filter(Boolean))];
  const componentClass = componentClasses.includes(selection?.className)
    ? selection.className
    : (allQuantities.find(item => item.id === selection?.quantityId)?.class_name || componentClasses[0] || '');
  const quantities = allQuantities.filter(item => item.class_name === componentClass);
  const quantity = quantities.find(item => item.id === selection?.quantityId) || quantities[0];
  const categories = quantity?.categories || [];
  const selectedCategories = selectedResultCategories(selection).filter(category => categories.includes(category));
  const periods = quantity?.periods?.length ? quantity.periods : (run?.periods || []);
  const busy = resultStatus?.state === 'loading';
  const mapModes = resultMapModes(quantity);
  const initialViewRequested = useRef(false);

  useEffect(() => {
    if (initialViewRequested.current || catalogStatus?.state !== 'ready'
      || !selection?.runId || !selection?.quantityId || !selection?.period || !onShow
      || run?.run_id !== selection.runId || quantity?.id !== selection.quantityId
      || !periods.includes(selection.period)) return;
    initialViewRequested.current = true;
    if (!busy && !resultStatus?.scene) onShow(selection);
  }, [catalogStatus?.state, selection, run, quantity, periods, onShow, busy, resultStatus?.scene]);

  const selectAndShow = next => {
    onSelectionChange(next);
    // Pass the new selection directly: React state has not updated yet.
    // The existing result request aborts superseded queries before publishing.
    onShow?.(next);
  };

  const selectRun = (runId) => {
    const nextRun = compatibleRuns.find(item => item.run_id === runId);
    const preferredClass = selection?.className || 'Node';
    const nextQuantity = nextRun?.quantities?.find(item => item.class_name === preferredClass && item.id === selection?.quantityId)
      || nextRun?.quantities?.find(item => item.class_name === preferredClass)
      || nextRun?.quantities?.find(item => item.id === 'Node.Price')
      || nextRun?.quantities?.[0];
    selectAndShow({
      runId,
      runLabel: nextRun?.label || runId,
      runModelVersion: nextRun?.result_model_version || '',
      ...retainResultCategories(selection, nextQuantity),
      quantityId: nextQuantity?.id || '',
      reportFamily: nextQuantity?.report_family || '',
      className: nextQuantity?.class_name || '',
      propertyName: nextQuantity?.property_name || '',
      unit: nextQuantity?.unit || '',
      period: nextQuantity?.periods?.[0] || nextRun?.periods?.[0] || '',
      scopeId: selection?.scopeId || '',
      supportsFlowMap: Boolean(nextQuantity?.supports_flow_map),
      derivedNetFlow: Boolean(nextQuantity?.derived_net_flow),
      mapMode: resultMapModes(nextQuantity)[0].id,
    });
  };

  const selectComponentClass = (className) => {
    const next = allQuantities.find(item => item.class_name === className);
    if (!next) return;
    selectAndShow({
      ...selection,
      runId: run?.run_id || '',
      runLabel: run?.label || run?.run_id || '',
      runModelVersion: run?.result_model_version || '',
      category: '',
      categories: [],
      categoryObjects: [],
      quantityId: next.id,
      reportFamily: next.report_family || '',
      className: next.class_name,
      propertyName: next.property_name,
      unit: next.unit || '',
      period: next.periods?.[0] || run?.periods?.[0] || '',
      supportsFlowMap: Boolean(next.supports_flow_map),
      derivedNetFlow: Boolean(next.derived_net_flow),
      mapMode: resultMapModes(next)[0].id,
    });
  };

  const selectQuantity = (quantityId) => {
    const next = quantities.find(item => item.id === quantityId);
    if (!next) return;
    selectAndShow({
      ...selection,
      runId: run?.run_id || '',
      runLabel: run?.label || run?.run_id || '',
      runModelVersion: run?.result_model_version || '',
      ...retainResultCategories(selection, next),
      quantityId: next.id,
      reportFamily: next.report_family || '',
      className: next.class_name,
      propertyName: next.property_name,
      unit: next.unit || '',
      period: next.periods?.[0] || run?.periods?.[0] || '',
      supportsFlowMap: Boolean(next.supports_flow_map),
      derivedNetFlow: Boolean(next.derived_net_flow),
      mapMode: resultMapModes(next)[0].id,
    });
  };

  if (catalogStatus?.state === 'loading') {
    return <div role="status" className="atlas-results-notice"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{catalogStatus.progress?.total ? `Reading result catalogues · ${catalogStatus.progress.completed}/${catalogStatus.progress.total}` : 'Discovering registered result runs…'}</div>;
  }
  if (catalogStatus?.state === 'error') {
    return <div role="alert" className="atlas-results-notice is-error">{catalogStatus.error}</div>;
  }
  if (!compatibleRuns.length) {
    return <div role="status" className="atlas-results-notice">
      <p>No saved results found for this model version.</p>
      {(catalog?.runs || []).map(item => <p key={item.run_id} className="mt-1">{item.label}: {item.binding_reason}</p>)}
    </div>;
  }

  return (
    <div className="atlas-results-controls">
      {catalog?.pending_runs?.length > 0 && <p role="status">Reading other result catalogues · {catalogStatus.progress?.completed || 0}/{catalogStatus.progress?.total || '…'}. Loaded runs are available.</p>}
      <div className="atlas-results-controls__fields">
      <label className="atlas-results-controls__field is-wide">
        <span>Result run</span>
        <select value={run?.run_id || ''} onChange={event => selectRun(event.target.value)} title={run?.label || run?.run_id}>
          {compatibleRuns.map(item => <option key={item.run_id} value={item.run_id}>{item.label || item.run_id}</option>)}
        </select>
      </label>
      <label className="atlas-results-controls__field">
        <span>Component</span>
        <select value={componentClass} onChange={event => selectComponentClass(event.target.value)} aria-label="Result component">
          {componentClasses.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="atlas-results-controls__field">
        <span>Map style</span>
        <select aria-label="Result map style" value={selection?.mapMode || mapModes[0].id}
          onChange={event => selectAndShow({ ...selection, mapMode: event.target.value })}>
          {mapModes.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
      </label>
      <label className="atlas-results-controls__field is-wide">
        <span>Quantity</span>
        <select value={quantity?.id || ''} onChange={event => selectQuantity(event.target.value)} title={quantity ? quantityLabel(quantity) : ''}>
          {quantities.map(item => <option key={`${item.id}:${item.unit || ''}`} value={item.id}>{quantityLabel(item)}</option>)}
        </select>
      </label>
      <div className="atlas-results-controls__field is-wide">
        <label htmlFor="atlas-result-category">Categories</label>
        <select
          id="atlas-result-category"
          value={selectedCategories.length ? '' : '__all__'}
          onChange={event => {
            if (!event.target.value) return;
            selectAndShow({ ...selection, ...resultCategorySelection(event.target.value === '__all__' ? []
              : [...selectedCategories, event.target.value], quantity) });
          }}
          disabled={!categories.length}
          aria-label="Result category"
          title={selectedCategories.join(', ') || 'All categories'}
        >
          {selectedCategories.length > 0 && <option value="">Add category…</option>}
          <option value="__all__">All categories</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        {selectedCategories.length > 0 && <div className="atlas-results-categories" aria-label="Selected result categories">
          {selectedCategories.map(category => <button type="button" key={category}
            aria-label={`Remove result category ${category}`} onClick={() => selectAndShow({ ...selection,
              ...resultCategorySelection(selectedCategories.filter(value => value !== category), quantity) })}>
            {category}<X size={14} aria-hidden="true" />
          </button>)}
        </div>}
      </div>
      <label className="atlas-results-controls__field">
        <span>Result period</span>
        <select value={selection?.period || periods[0] || ''} onChange={event => selectAndShow({ ...selection, period: event.target.value })}>
          {periods.map(period => <option key={period} value={period}>{run.period_granularity === 'annual' ? `Annual ${period}` : period}</option>)}
        </select>
      </label>
      <label className="atlas-results-controls__field is-wide">
        <span>Node / region</span>
        <select value={selection?.scopeId || ''} onChange={event => selectAndShow({ ...selection, scopeId: event.target.value })} aria-label="Result node or region">
          <option value="">All nodes and regions</option>
          {scopeOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      </div>
      {componentClass !== 'Line' && onMarkerScaleChange && <ResultMarkerSizeControl value={markerScale} onChange={onMarkerScaleChange} />}
      {resultStatus?.state === 'error' && <div role="alert" className="atlas-results-notice is-error">{resultStatus.error}</div>}
      {resultStatus?.scene && (
        <div className="atlas-results-notice">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{resultStatus.scene.selection?.id}</strong> shown for {resultStatus.scene.selection?.period_label}. {Number(resultStatus.scene.coverage?.mapped_row_count ?? resultStatus.scene.coverage?.projected_row_count ?? 0).toLocaleString()} mapped objects.</span>
        </div>
      )}
      {resultStatus?.scene?.color_policy && <small role="status" className="atlas-results-colour-status">
        {resultStatus.scene.color_policy.preference === 'decrease' ? 'AI colours: lower is green, higher is red.'
          : resultStatus.scene.color_policy.preference === 'increase' ? 'AI colours: higher is green, lower is red.'
            : 'AI colours: neutral—no favourable direction established.'}
      </small>}
      <div className="atlas-results-controls__actions">
        <button type="button" onClick={() => onShow?.(selection)} disabled={busy || !quantity} className="atlas-primary-action">
          {busy ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{resultStatus.progress?.phase === 'interpretation'
            ? 'AI colour recommendation · 0/1' : resultStatus.progress?.phase === 'projection'
            ? `Mapping ${resultStatus.progress.total} result rows…` : resultStatus.progress?.phase === 'coordinates'
              ? 'Reading model coordinate memberships · 0/1' : 'Querying result run…'}</span> : 'Refresh map'}
        </button>
        {resultStatus?.scene && <button type="button" onClick={onClear} aria-label="Clear result layer" title="Clear result layer" className="atlas-results-controls__clear"><X className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
