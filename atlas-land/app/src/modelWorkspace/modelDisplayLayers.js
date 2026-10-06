import { assetPath, readAssetApi, validateAssetBinding, inputAssetValues } from './modelAssets';
import { forEachAssetInputBatch, clearAssetInputBatchCache, ASSET_INPUT_RETRY_BUDGET_MS } from './assetInputBatches';
import { effectiveAssetInput, loadModelInputOverrides, modelInputDate } from './modelInputContext';
import { generatorInstalledCapacity } from './modelInstalledCapacity';
import { clearModelSceneCache } from './modelSceneCache';

// PLEXOS class/property adapters, not project/category-name inference. Carrier
// separation comes exclusively from the canonical scene's declared categories.
const SPECS = [
  { layer: 'supply', className: 'Generator', component: 'Generator', property: 'Max Capacity' },
  { layer: 'storage', className: 'Battery', component: 'StorageUnit', property: 'Max Power' },
  { layer: 'storage', className: 'Storage', component: 'Store', property: 'Max Volume' },
  { layer: 'demand', className: 'Node', component: 'Load', property: 'Load' },
];
const DOMAINS = { supply: 'Supply', storage: 'Storage', demand: 'Demand' };
const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isFinite(Number(value)) ? Number(value) : null;
// Only fulfilled, read-only inventories are reused. No in-flight promise retains
// another request's abort signal. Input snapshots have a separate 30-second,
// date/scenario/property-scoped cache; the service validates durable file caches.
const inventories = new Map();
export const clearDisplayLayerCache = () => { inventories.clear(); clearAssetInputBatchCache(); clearModelSceneCache(); };

function validateInventory(payload, project, version, cls) {
  validateAssetBinding(payload, project, version);
  if (payload.schema !== 'nohm.atlas.model-assets.v1' || !Array.isArray(payload.objects)
      || payload.objects.some(obj => obj.class_name !== cls || !Array.isArray(obj.nodes))) {
    throw new Error('The model database returned an invalid layer inventory.');
  }
  if (new Set(payload.objects.map(obj => obj.id)).size !== payload.objects.length
      || new Set(payload.objects.map(obj => obj.name)).size !== payload.objects.length) {
    throw new Error('The model database returned duplicate object identities.');
  }
  return payload;
}

function layerFacility(obj, spec, input, scene, nativeNodes, date, basis) {
  // Same direct/indirect Node memberships and disclosed display anchors as
  // Model database. Never infer coordinates from a name or a nearest node.
  const placement = obj.nodes.find(node => {
    const native = nativeNodes.get(`Node:${node.name}`);
    const point = node.position;
    return node.class_name === 'Node' && native?.category === node.category
      && number(point?.lat) != null && number(point?.lon) != null
      && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lon)) <= 180;
  });
  if (!placement) return null;
  const sourceNode = nativeNodes.get(`Node:${placement.name}`);
  const displayNode = nativeNodes.get(placement.position.canonical_reference) || sourceNode;
  const id = `${obj.class_name}:${obj.name}`;
  const measured = input?.status === 'resolved' && number(input.value) != null;
  const value = measured ? number(input.value) : null, unit = input?.unit || '';
  const demand = spec.layer === 'demand';
  return {
    id: demand ? `${id}:demand` : id, nodeId: demand ? `${id}:demand` : id,
    name: obj.name, parentName: obj.name, latitude: Number(placement.position.lat), longitude: Number(placement.position.lon),
    country: displayNode.country || '', region: displayNode.country || '', bus: displayNode.id,
    type: spec.component, component_type: spec.component, atlas_domain: DOMAINS[spec.layer],
    carrier: obj.category, carrier_key: obj.category, carrier_nice_name: obj.category,
    editable: false, is_virtual: false, source_model_project: scene.meta.projectId,
    source_model_version: scene.meta.version, source_model_name: scene.meta.modelName,
    source_model_class: obj.class_name,
    source_id: id, source_asset_id: obj.id, position_lineage: placement.position,
    input_resolution: input || { status: 'unresolved', value: null, note: 'No resolved input value.' },
    p_nom: !demand && unit === 'MW' ? value : null,
    e_nom: !demand && unit === 'MWh' ? value : null,
    p_set: demand && unit === 'MW' ? value : null,
    map_scale_value: demand && unit === 'MW' ? value : null,
    membership: { collection: 'Canonical model schema', parentClass: obj.class_name, childClass: 'Node',
      parentCategory: obj.category, childCategory: placement.category },
    properties: [
      { Property: 'Source ID', Value: id, Units: '' },
      { Property: 'Node', Value: sourceNode.id, Units: '' },
      { Property: spec.property, Value: input?.capacity_per_unit?.value ?? value ?? 'Unresolved', Units: unit },
      ...(input?.derivation ? [
        { Property: 'Units', Value: input.unit_count?.value ?? 'Unresolved', Units: '-' },
        { Property: 'Installed Capacity', Value: value ?? 'Unresolved', Units: unit },
        { Property: 'Capacity basis', Value: input.derivation, Units: '' },
      ] : []),
      ...(demand && unit === 'MW' ? [{ Property: 'P Set', Value: value, Units: unit }] : []),
      { Property: 'Input basis', Value: basis, Units: '' },
      { Property: 'Input date', Value: date || (input?.inferred_year ? `File year ${input.inferred_year}` : 'Undated inputs'), Units: '' },
      ...(input?.note ? [{ Property: 'Input status', Value: input.note, Units: '' }] : []),
      { Property: 'Coordinate source', Value: placement.position.source || '', Units: '' },
      ...(placement.position.placement_note ? [{ Property: 'Placement', Value: placement.position.placement_note, Units: '' }] : []),
    ],
  };
}

export async function loadModelDisplayLayers(scene, requestedLayers, options = {}, fetchImpl = window.fetch.bind(window)) {
  const specs = SPECS.filter(spec => requestedLayers.includes(spec.layer)
    && scene.meta.declaredCategories?.[spec.className]?.length);
  if (!specs.length) return { ...scene, meta: { ...scene.meta, displayLayers: [...requestedLayers], layerEvidence: {} } };
  const { projectId, version, modelName } = scene.meta;
  const inputDate = modelInputDate(scene.meta);
  const date = inputDate ? `${inputDate}:00` : '';
  const requestOptions = { signal: options.signal, apiBase: options.apiBase, timeoutMs: options.timeoutMs || 30000 };
  const read = async (suffix, params) => {
    const payload = await readAssetApi(assetPath(projectId, suffix, { version, ...params }), requestOptions, fetchImpl);
    if (options.signal?.aborted) throw new DOMException('Layer loading cancelled', 'AbortError');
    return validateAssetBinding(payload, projectId, version);
  };
  let completed = 0;
  const total = specs.reduce((count, spec) => count + (spec.className === 'Generator' ? 3 : 2), 0) + (modelName ? 1 : 0);
  const progress = (current, items = {}) => options.onProgress?.({ completed, total, current, ...items });
  let changes = new Map();
  if (modelName) {
    progress('Reading attached scenarios');
    changes = await loadModelInputOverrides({ projectId, version, modelName, inputDate: date,
      classNames: specs.map(spec => spec.className), ...requestOptions }, fetchImpl);
    completed += 1;
  }
  const nativeNodes = new Map((scene.scene.nodes || []).map(node => [node.id, node]));
  const facilities = scene.facilities.filter(row => !specs.some(spec => row.atlas_domain === DOMAINS[spec.layer]));
  const evidence = {};
  // One retry budget for every input read in this load, so retried batches cannot add up past it.
  const retryUntil = Date.now() + ASSET_INPUT_RETRY_BUDGET_MS;
  for (const spec of specs) {
    progress(`Reading ${spec.className} locations`);
    const key = JSON.stringify([options.apiBase || '', projectId, version, spec.className]);
    let inventory = inventories.get(key);
    if (!inventory) {
      inventory = validateInventory(await read('', { class_name: spec.className }), projectId, version, spec.className);
      inventories.set(key, inventory);
      if (inventories.size > 8) inventories.delete(inventories.keys().next().value);
    }
    completed += 1;
    const categories = scene.meta.declaredCategories?.[spec.className] || [];
    const objects = inventory.objects.filter(obj => (categories.includes('*') || categories.includes(obj.category))
      && (spec.layer !== 'demand' || obj.properties.includes(spec.property)));
    progress(`Reading ${spec.className} ${spec.property}`, { objectsCompleted: 0, objectsTotal: objects.length });
    const values = new Map();
    await forEachAssetInputBatch({ projectId, version, className: spec.className, propertyName: spec.property,
      objects, inputDate: date, signal: options.signal, apiBase: options.apiBase,
      timeoutMs: options.timeoutMs || 15000,
      concurrency: 4, retryUntil,
      reuse: true,
      onBatch: (payload, items) => {
        if (payload.class_name !== spec.className || payload.property_name !== spec.property)
          throw new Error('Input values do not match the selected layer inventory.');
        inputAssetValues(payload).forEach((value, id) => values.set(id, { ...value,
          status: value.status || (number(value.value) != null ? 'resolved' : 'unresolved') }));
        progress(`Reading ${spec.className} ${spec.property}`,
          { objectsCompleted: items.completed, objectsTotal: items.total });
      },
    }, fetchImpl);
    completed += 1;
    const unitCounts = new Map();
    if (spec.className === 'Generator') {
      progress('Reading Generator Units', { objectsCompleted: 0, objectsTotal: objects.length });
      await forEachAssetInputBatch({ projectId, version, className: spec.className, propertyName: 'Units',
        objects, inputDate: date, signal: options.signal, apiBase: options.apiBase,
        timeoutMs: options.timeoutMs || 15000,
        concurrency: 4, retryUntil,
        reuse: true,
        onBatch: (payload, items) => {
          if (payload.class_name !== spec.className || payload.property_name !== 'Units')
            throw new Error('Unit counts do not match the selected generator inventory.');
          inputAssetValues(payload).forEach((value, id) => unitCounts.set(id, { ...value,
            status: value.status || (number(value.value) != null ? 'resolved' : 'unresolved') }));
          progress('Reading Generator Units', { objectsCompleted: items.completed, objectsTotal: items.total });
        },
      }, fetchImpl);
      completed += 1;
    }
    const summary = evidence[spec.layer] || { total: 0, mapped: 0, resolved: 0, anchored: 0 };
    for (const obj of objects) {
      const capacity = effectiveAssetInput(obj, spec.property, values.get(obj.id), changes);
      const effective = spec.className === 'Generator' ? generatorInstalledCapacity(capacity,
        effectiveAssetInput(obj, 'Units', unitCounts.get(obj.id), changes)) : capacity;
      const record = layerFacility(obj, spec, effective, scene, nativeNodes, date, modelName || 'Base inputs');
      summary.total += 1;
      if (!record) continue;
      facilities.push(record); summary.mapped += 1;
      summary.resolved += record.input_resolution.status === 'resolved' && number(record.input_resolution.value) != null ? 1 : 0;
      summary.anchored += record.position_lineage.is_display_anchor ? 1 : 0;
    }
    evidence[spec.layer] = summary;
  }
  progress('Model layers ready');
  return { ...scene, facilities, meta: { ...scene.meta, displayLayers: [...requestedLayers], layerEvidence: evidence } };
}
