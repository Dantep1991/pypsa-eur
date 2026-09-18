import { scopedAtlasConnectionIdentity } from './atlasNetworkOverlay';

// Read-only staging: results retain request order, not completion order. A
// failure aborts the remaining work and never publishes a partial map.
export async function stageMapBatch(tasks, load, { concurrency = 3, signal, timeoutMs = 180000, onProgress } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const results = new Array(tasks.length);
  let next = 0;
  let completed = 0;
  let failure;
  if (!controller.signal.aborted) onProgress?.({ completed, total: tasks.length });
  const worker = async () => {
    while (next < tasks.length && !controller.signal.aborted) {
      const index = next++;
      let timer;
      let onAbort;
      try {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('Network loading timed out. The previous map has been kept; please retry.'));
            controller.abort();
          }, timeoutMs);
        });
        const cancelled = new Promise((_, reject) => {
          onAbort = () => reject(new DOMException('Network loading cancelled', 'AbortError'));
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });
        results[index] = await Promise.race([load(tasks[index], controller.signal), deadline, cancelled]);
        if (controller.signal.aborted) throw new DOMException('Network loading cancelled', 'AbortError');
        completed += 1;
        onProgress?.({ completed, total: tasks.length });
      } catch (error) {
        if (!failure) failure = error;
        controller.abort();
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
      }
    }
  };
  try {
    const workers = Math.max(1, Math.min(4, tasks.length, Math.floor(concurrency) || 1));
    await Promise.all(Array.from({ length: workers }, worker));
    if (failure) throw failure;
    if (controller.signal.aborted) throw new DOMException('Network loading cancelled', 'AbortError');
    return results;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

export function groupPypsaFacilities(facilities) {
  const unique = new Map();
  for (const facility of facilities) {
    const base = { ...facility };
    delete base.sameLocationFacilities;
    delete base.sameLocationCount;
    delete base.locationKey;
    unique.set(`${base.sourceCountryCode || ''}::${base.id || base.name || ''}`, base);
  }
  const groups = new Map();
  const locationKey = (facility) => `${parseFloat(parseFloat(facility.latitude).toFixed(4))},${parseFloat(parseFloat(facility.longitude).toFixed(4))}`;
  for (const facility of unique.values()) {
    const key = locationKey(facility);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(facility);
  }
  // Sort once per location rather than copying/sorting the same group for
  // every component attached to the bus.
  for (const group of groups.values()) {
    group.sort((a, b) => Number(Boolean(a.is_virtual)) - Number(Boolean(b.is_virtual))
      || String(a.carrier_nice_name || a.carrier || a.type || a.name || '')
        .localeCompare(String(b.carrier_nice_name || b.carrier || b.type || b.name || '')));
  }
  return [...unique.values()].map((facility) => {
    const key = locationKey(facility);
    const group = groups.get(key);
    return { ...facility, locationKey: key, sameLocationCount: group.length, sameLocationFacilities: group };
  });
}

// Preserve shared co-location groups while changing a field such as the source
// directory of a regional solve. Caches live only for this transformation;
// no global cache retains previous networks or solved runs.
export function mapSharedFacilityGroups(facilities, transform) {
  const records = new WeakMap();
  const groups = new WeakMap();
  const mapRecord = (record) => {
    if (!records.has(record)) records.set(record, transform(record));
    return records.get(record);
  };
  return facilities.map((facility) => {
    const updated = mapRecord(facility);
    const group = facility.sameLocationFacilities;
    if (!Array.isArray(group)) return updated;
    if (!groups.has(group)) {
      const mapped = group.map(mapRecord);
      groups.set(group, mapped.some((item, index) => item !== group[index]) ? mapped : group);
    }
    const updatedGroup = groups.get(group);
    return updatedGroup === group ? updated : { ...updated, sameLocationFacilities: updatedGroup };
  });
}

export function assembleMapBatch(stages, previous = {}, mode = 'replace') {
  if (!stages.length) throw new Error('No country networks were loaded.');
  const mergeDomains = mode === 'domains';
  const extend = mode === 'add' || mergeDomains;
  const replaced = new Set(stages.map((stage) => stage.countryCode));
  const replacedDomains = new Map();
  for (const stage of stages) {
    if (!stage.countryCode || !stage.filename || !Array.isArray(stage.facilities)
        || !Array.isArray(stage.connections) || !Array.isArray(stage.overlays)) {
      throw new Error('Incomplete staged network; the previous map has been kept.');
    }
    if (mergeDomains && !(previous.networks || []).some((network) => (
      network.countryCode === stage.countryCode && network.filename === stage.filename
    ))) throw new Error('The network changed while loading its layers; please retry.');
    if (!replacedDomains.has(stage.countryCode)) replacedDomains.set(stage.countryCode, new Set());
    Object.keys(stage.domains || {}).forEach((domain) => replacedDomains.get(stage.countryCode).add(domain));
  }
  const keep = (record) => mode === 'add' && !replaced.has(record.sourceCountryCode);
  const keepFacility = (record) => mergeDomains
    ? !replacedDomains.get(record.sourceCountryCode)?.has(record.atlas_domain)
    : keep(record);
  // Component scopes do not own the grid topology. Only a new Grid response
  // can replace that country's lines/boundaries; other scopes are deduplicated.
  const keepTopology = (record) => mergeDomains
    ? !replacedDomains.get(record.sourceCountryCode)?.has('Grid')
    : keep(record);
  const facilities = groupPypsaFacilities([
    ...(previous.facilities || []).filter(keepFacility), ...stages.flatMap((stage) => stage.facilities),
  ]);
  const stagedConnections = stages.flatMap((stage) => stage.connections);
  const stagedOverlays = stages.flatMap((stage) => stage.overlays);
  const replacesGrid = [...replacedDomains.values()].some((domainsForCountry) => domainsForCountry.has('Grid'));
  // Lazy Supply, Demand and Storage responses normally contain no topology.
  // Preserve the array identity in that common case so downstream country,
  // capacity and canvas caches can keep the already-rendered Grid frame.
  const connections = mergeDomains && !replacesGrid && stagedConnections.length === 0
    ? (previous.connections || [])
    : (() => {
      const unique = new Map();
      for (const connection of [...(previous.connections || []).filter(keepTopology), ...stagedConnections]) {
        unique.set(scopedAtlasConnectionIdentity(connection), connection);
      }
      return [...unique.values()];
    })();
  const overlays = mergeDomains && !replacesGrid && stagedOverlays.length === 0
    ? (previous.overlays || [])
    : (() => {
      const unique = new Map();
      for (const overlay of [...(previous.overlays || []).filter(keepTopology), ...stagedOverlays]) {
        unique.set(`${overlay.sourceCountryCode}::${overlay.sourceNetworkFilename}::${overlay.name}`, overlay);
      }
      return [...unique.values()];
    })();
  const networks = new Map(extend ? (previous.networks || []).map((network) => [network.countryCode, network]) : []);
  const domains = {};
  if (extend) {
    for (const network of previous.networks || []) {
      if ((mergeDomains || !replaced.has(network.countryCode)) && previous.domains?.[network.filename]) {
        domains[network.filename] = previous.domains[network.filename];
      }
    }
  }
  for (const stage of stages) {
    const previousNetwork = networks.get(stage.countryCode);
    const availability = {
      ...(previousNetwork?.filename === stage.filename ? previousNetwork.domainAvailability : {}),
      ...stage.availability,
    };
    networks.set(stage.countryCode, {
      countryCode: stage.countryCode, countryName: stage.countryName, filename: stage.filename,
      ...(Object.keys(availability).length ? { domainAvailability: availability } : {}),
    });
    domains[stage.filename] = { ...domains[stage.filename], ...stage.domains };
  }
  return { facilities, connections, overlays, networks: [...networks.values()], domains };
}
