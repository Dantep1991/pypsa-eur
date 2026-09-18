const CACHE_VERSION = 1;
const CACHE_PREFIX = 'atlas-pypsa-catalogue';
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FILES = 12000;

const FILE_FIELDS = [
  'filename',
  'size_kb',
  'modified',
  'is_distill',
  'granularity_prefix',
  'geographic_country',
  'full_country',
  'geographic_level',
  'geographicLevel',
  'geographic_clusters',
  'physical_cluster_buses',
  'is_full_nodal_network',
  'is_geographic_cluster',
  'isFullNodal',
];

const normalizedToken = (value, fallback) => {
  const token = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,48}$/.test(token) ? token : fallback;
};

export const pypsaCatalogueCacheKey = (granularityPrefix = 'pypsa', sourceMode = 'auto') => (
  `${CACHE_PREFIX}:v${CACHE_VERSION}:${normalizedToken(granularityPrefix, 'pypsa')}:${normalizedToken(sourceMode, 'auto')}`
);

export const clearPypsaCatalogueCache = (storage, granularityPrefix = 'pypsa', sourceMode = 'auto') => {
  if (!storage?.removeItem) return false;
  try {
    storage.removeItem(pypsaCatalogueCacheKey(granularityPrefix, sourceMode));
    return true;
  } catch (_) {
    return false;
  }
};

const sanitizeFiles = (files) => {
  if (!Array.isArray(files)) return [];
  return files.slice(0, MAX_FILES).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const filename = String(entry.filename || '').trim();
    if (!filename || filename.length > 512) return [];
    const clean = { filename };
    FILE_FIELDS.slice(1).forEach((field) => {
      const value = entry[field];
      if (value == null) return;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') clean[field] = value;
      else if (Array.isArray(value)) clean[field] = value.slice(0, 2000);
    });
    return [clean];
  });
};

export const writePypsaCatalogueCache = (
  storage,
  granularityPrefix,
  sourceMode,
  payload,
  now = Date.now(),
) => {
  if (!storage?.setItem) return false;
  const files = sanitizeFiles(payload?.files);
  if (!files.length) return false;
  const capabilities = payload?.capabilities && typeof payload.capabilities === 'object'
    ? { parse_nc_omit_geojson_overlays: payload.capabilities.parse_nc_omit_geojson_overlays === true }
    : {};
  const record = {
    version: CACHE_VERSION,
    savedAt: Number(now),
    source: String(payload?.source || sourceMode || 'auto').slice(0, 48),
    files,
    capabilities,
  };
  try {
    storage.setItem(pypsaCatalogueCacheKey(granularityPrefix, sourceMode), JSON.stringify(record));
    return true;
  } catch (_) {
    return false;
  }
};

export const readPypsaCatalogueCache = (
  storage,
  granularityPrefix = 'pypsa',
  sourceMode = 'auto',
  options = {},
) => {
  if (!storage?.getItem) return null;
  const now = Number(options.now ?? Date.now());
  const maxAgeMs = Number(options.maxAgeMs ?? DEFAULT_MAX_AGE_MS);
  try {
    const raw = storage.getItem(pypsaCatalogueCacheKey(granularityPrefix, sourceMode));
    if (!raw) return null;
    const record = JSON.parse(raw);
    const files = sanitizeFiles(record?.files);
    const savedAt = Number(record?.savedAt);
    if (record?.version !== CACHE_VERSION || !files.length || !Number.isFinite(savedAt)) return null;
    const ageMs = Math.max(0, now - savedAt);
    if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && ageMs > maxAgeMs) return null;
    return {
      files,
      source: String(record.source || sourceMode || 'auto'),
      capabilities: record.capabilities && typeof record.capabilities === 'object' ? record.capabilities : {},
      savedAt,
      ageMs,
    };
  } catch (_) {
    return null;
  }
};
