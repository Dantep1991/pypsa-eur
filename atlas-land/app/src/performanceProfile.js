export const MAP_PERFORMANCE_PREFERENCES = Object.freeze({
  AUTO: 'auto',
  QUALITY: 'quality',
  PERFORMANCE: 'performance',
});

export const MAP_PERFORMANCE_STORAGE_KEY = 'nova-performance-mode';

const finitePositive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function readMapPerformancePreference(storage) {
  try {
    const stored = storage?.getItem?.(MAP_PERFORMANCE_STORAGE_KEY);
    if (stored === '1' || stored === MAP_PERFORMANCE_PREFERENCES.PERFORMANCE) {
      return MAP_PERFORMANCE_PREFERENCES.PERFORMANCE;
    }
    if (stored === '0' || stored === MAP_PERFORMANCE_PREFERENCES.QUALITY) {
      return MAP_PERFORMANCE_PREFERENCES.QUALITY;
    }
    if (stored === MAP_PERFORMANCE_PREFERENCES.AUTO) {
      return MAP_PERFORMANCE_PREFERENCES.AUTO;
    }
  } catch (_) {
    // Storage is an optional preference, never a startup dependency.
  }
  return MAP_PERFORMANCE_PREFERENCES.AUTO;
}

export function deviceNeedsMapPerformanceMode({ navigatorLike, matchMedia } = {}) {
  const nav = navigatorLike || {};
  const memoryGb = finitePositive(nav.deviceMemory);
  const logicalProcessors = finitePositive(nav.hardwareConcurrency);
  let reducedMotion = false;
  try {
    reducedMotion = Boolean(matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch (_) {
    // Older browsers and test environments may not expose matchMedia.
  }
  return {
    enabled: Boolean(
      nav.connection?.saveData
      || reducedMotion
      || (memoryGb != null && memoryGb <= 4)
      || (logicalProcessors != null && logicalProcessors <= 4)
    ),
    reason: nav.connection?.saveData
      ? 'data saver'
      : reducedMotion
        ? 'reduced motion'
        : (memoryGb != null && memoryGb <= 4) || (logicalProcessors != null && logicalProcessors <= 4)
          ? 'this device'
          : '',
  };
}

export function resolveMapPerformanceMode({
  preference = MAP_PERFORMANCE_PREFERENCES.AUTO,
  facilityCount = 0,
  connectionCount = 0,
  navigatorLike,
  matchMedia,
  // HTML-backed detailed markers can breach the work-laptop DOM budget before
  // the raw facility count reaches 2,200 (notably Grid + Storage + Supply,
  // where interactive generation pies add their own DOM nodes). Switch the
  // ordinary node layer to Canvas early enough to keep those richer overlays.
  denseFacilityThreshold = 1800,
  denseConnectionThreshold = 1800,
} = {}) {
  if (preference === MAP_PERFORMANCE_PREFERENCES.PERFORMANCE) {
    return { enabled: true, automatic: false, reason: 'manual preference' };
  }
  if (preference === MAP_PERFORMANCE_PREFERENCES.QUALITY) {
    return { enabled: false, automatic: false, reason: 'manual preference' };
  }

  const deviceDecision = deviceNeedsMapPerformanceMode({ navigatorLike, matchMedia });
  if (deviceDecision.enabled) {
    return { enabled: true, automatic: true, reason: deviceDecision.reason };
  }
  if (Number(connectionCount) >= denseConnectionThreshold || Number(facilityCount) >= denseFacilityThreshold) {
    return { enabled: true, automatic: true, reason: 'dense map' };
  }
  return { enabled: false, automatic: true, reason: 'full visual quality' };
}
