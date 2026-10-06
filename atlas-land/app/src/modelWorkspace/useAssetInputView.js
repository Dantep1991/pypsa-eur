import { useEffect, useMemo, useRef, useState } from 'react';
import { inputAssetValues } from './modelAssets';
import { forEachAssetInputBatch } from './assetInputBatches';
import { effectiveAssetInput, loadModelInputOverrides } from './modelInputContext';
import { evaluateInputEquation } from './inputEquation';

const empty = new Map();
const recordYears = rows => rows.flatMap(row => ['Date_x0020_From', 'Date_x0020_To', 'Date From', 'Date To']
  .map(key => /^\d{4}-/.test(row[key] || '') ? Number(row[key].slice(0, 4)) : null).filter(Boolean));

// One cancellable, version/date/scenario-bound read path for property and formula
// views. Cache only complete property snapshots, never partial batch totals.
export default function useAssetInputView({ projectId, version, className, category, objects, scene,
  visible, inputMode, inputProperty, inputDate, inputScenario, activeModel, equationPlan, equationError, onShow }) {
  const [state, setState] = useState({ key: '', values: empty, context: null });
  const [retry, setRetry] = useState(0);
  const controllerRef = useRef(null), cacheRef = useRef(new Map()), contextRef = useRef(new Map()), showRef = useRef(onShow);
  showRef.current = onShow;
  const scope = JSON.stringify([projectId, version, className, category, objects.map(obj => obj.id), inputDate, inputScenario, activeModel]);
  const references = equationPlan ? equationPlan.properties : inputProperty ? [inputProperty] : [];
  const referenceKey = JSON.stringify(references);
  const key = JSON.stringify([scope, inputMode, inputProperty, equationPlan?.expression, equationError]);
  const contextKey = JSON.stringify([projectId, version, className]);
  const current = state.key === key ? state : { values: empty, context: contextRef.current.get(contextKey) || null };
  useEffect(() => {
    const cache = cacheRef.current;
    cache.clear(); contextRef.current.clear();
  }, [projectId, version]);
  useEffect(() => {
    controllerRef.current?.abort();
    if (!visible || !scene || !inputMode || equationError || (!equationPlan && !inputProperty)) return undefined;
    if (state.key === key && state.complete && !retry) return undefined;
    const controller = new AbortController(); controllerRef.current = controller;
    let timer;
    setState({ key, values: empty, context: contextRef.current.get(contextKey) || null, busy: true,
      progress: { completed: 0, total: objects.length * references.length, property: references[0] || 'Equation', unresolved: 0 } });
    const load = async () => {
      try {
        const propertyValues = new Map(), contexts = [], cache = cacheRef.current;
        const needsRead = references.some(property => !cache.has(JSON.stringify([scope, property])));
        const overrides = needsRead && inputScenario === '@model' && activeModel
          ? await loadModelInputOverrides({ projectId, version, modelName: activeModel, inputDate, classNames: [className], signal: controller.signal }) : empty;
        let completed = 0;
        for (const property of references) {
          const cacheKey = JSON.stringify([scope, property]);
          let snapshot = cache.get(cacheKey);
          if (!snapshot) {
            const next = new Map(), years = new Set(), scenarios = new Set(), inferredYears = new Set();
            const byId = new Map(objects.map(obj => [obj.id, obj]));
            const completedBefore = completed;
            let latestContext = null;
            await forEachAssetInputBatch({ projectId, version, className, propertyName: property, objects, category,
              inputDate, scenario: inputScenario === '@model' ? '' : inputScenario, signal: controller.signal,
              onBatch: (payload, progress) => {
                const baseValues = inputAssetValues(payload);
                payload.objects.forEach(row => {
                  const effective = effectiveAssetInput(byId.get(row.id), property, baseValues.get(row.id), overrides);
                  const reported = (!effective?.status || effective.status === 'resolved') && Number.isFinite(effective?.value);
                  next.set(row.id, { ...effective, value: reported ? effective.value : null,
                    records: baseValues.get(row.id)?.records || [], note: reported ? '' : effective?.note || 'Input not resolved.' });
                  recordYears(row.records || []).forEach(year => years.add(year));
                });
                latestContext = payload.input_context || latestContext;
                (latestContext?.available_years || []).forEach(year => years.add(year));
                (latestContext?.available_scenarios || []).forEach(name => scenarios.add(name));
                if (latestContext?.inferred_year) inferredYears.add(latestContext.inferred_year);
                if (!controller.signal.aborted) setState(previous => ({ ...previous, progress: {
                  completed: completedBefore + progress.completed, total: objects.length * references.length,
                  property, unresolved: [...next.values()].filter(value => value.value == null).length } }));
              } });
            if (controller.signal.aborted) return;
            snapshot = { values: next, context: { ...latestContext, available_years: [...years].sort(),
              available_scenarios: [...scenarios].sort(), inferred_year: inferredYears.size === 1 ? [...inferredYears][0] : null } };
            cache.set(cacheKey, snapshot);
            while (cache.size > 32) cache.delete(cache.keys().next().value);
          }
          propertyValues.set(property, snapshot.values); contexts.push(snapshot.context);
          completed += objects.length;
        }
        if (controller.signal.aborted) return;
        const values = equationPlan ? evaluateInputEquation(equationPlan, objects, propertyValues) : propertyValues.get(inputProperty) || empty;
        const inferred = [...new Set(contexts.map(context => context.inferred_year).filter(Boolean))];
        const previousContext = contextRef.current.get(contextKey);
        const context = { input_date: inputDate, scenario: inputScenario === '@model' ? activeModel : inputScenario,
          available_years: [...new Set([...(previousContext?.available_years || []), ...contexts.flatMap(item => item.available_years)])].sort(),
          available_scenarios: [...new Set([...(previousContext?.available_scenarios || []), ...contexts.flatMap(item => item.available_scenarios)])].sort(),
          inferred_year: inferred.length === 1 ? inferred[0] : null };
        contextRef.current.set(contextKey, context);
        setState({ key, values, context, busy: false, complete: true }); showRef.current?.();
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, values: empty, context: contextRef.current.get(contextKey) || null, busy: false, error: error.message });
      }
    };
    // Debounce typed equations, not the user's dropdown choices. Cached operands
    // still recompute locally without another data-file read.
    if (equationPlan) timer = setTimeout(load, 250); else load();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, referenceKey, scene, visible, retry]);
  const values = useMemo(() => inputMode && !equationError ? current.values : empty, [inputMode, equationError, current.values]);
  return { ...current, values, error: equationError || current.error || '',
    cancel: () => { controllerRef.current?.abort(); setState(previous => ({ ...previous, busy: false, cancelled: true })); },
    reload: () => {
      for (const property of references) cacheRef.current.delete(JSON.stringify([scope, property]));
      setRetry(value => value + 1);
    } };
}
