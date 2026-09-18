import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

const OVERVIEW_FRAME_BUDGET_MS = 8;
const OVERVIEW_MAX_FEATURES_PER_FRAME = 500;
const OVERVIEW_DRAW_DEBOUNCE_MS = 280;
// A normal two-step zoom gesture visits three camera states (z, z+1, z+2).
// Keeping that tiny working set prevents the return trip, or a repeated filter
// adjustment at the same view, from rasterising the continent again. The cache
// is deliberately bounded: it is a presentation cache, not a tile pyramid.
const OVERVIEW_RASTER_CACHE_SIZE = 3;

const linesFromGeometry = (geometry) => {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return geometry.type === 'LineString' ? [geometry.coordinates] : [];
};

const styleKey = (style = {}) => [
  style.color || '#38bdf8',
  Number.isFinite(Number(style.weight)) ? Number(style.weight) : 1,
  Number.isFinite(Number(style.opacity)) ? Number(style.opacity) : 0.8,
  style.dashArray || '',
].join('|');

const parseStyleKey = (key) => {
  const [color, weight, opacity, dashArray] = key.split('|');
  return { color, weight: Number(weight), opacity: Number(opacity), dashArray };
};

// At continent scale, constructing one Leaflet Path object per connection costs
// substantially more memory than the geometry itself. This layer draws the same
// selected feature collection into one non-interactive canvas. Zooming in swaps
// back to BatchedNetworkLayer, restoring per-line hover and click inspection.
export default function OverviewNetworkCanvasLayer({ data, dataKey, reportedFeatureCount, onProgress, diagnostics = false }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const redrawRef = useRef(null);
  const latestRef = useRef({ data, dataKey, reportedFeatureCount, onProgress, diagnostics });
  latestRef.current = { data, dataKey, reportedFeatureCount, onProgress, diagnostics };

  useEffect(() => {
    const pane = map.getPane('atlas-links-overview') || map.createPane('atlas-links-overview');
    pane.style.zIndex = '390';
    pane.style.pointerEvents = 'none';
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated atlas-links-overview-canvas', pane);
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;
    let frame = 0;
    let timer = 0;
    let disposed = false;
    let generation = 0;
    const mercatorPointCache = new WeakMap();
    const preparedFeatureCache = new WeakMap();
    const rasterCache = new Map();

    const normalizedMercatorPoint = (coordinate) => {
      if (mercatorPointCache.has(coordinate)) return mercatorPointCache.get(coordinate);
      const longitude = Number(coordinate?.[0]);
      const latitude = Number(coordinate?.[1]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const clippedLatitude = Math.max(-85.0511287798, Math.min(85.0511287798, latitude));
      const sine = Math.sin(clippedLatitude * Math.PI / 180);
      // A tuple keeps the redraw loop allocation-free: the same normalized
      // coordinates are multiplied by the current world scale at every zoom.
      const point = [
        (longitude + 180) / 360,
        0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI),
      ];
      mercatorPointCache.set(coordinate, point);
      return point;
    };

    const preparedStyleGroups = (features) => {
      const cached = preparedFeatureCache.get(features);
      if (cached) return cached;
      const groups = new Map();
      for (const feature of features) {
        const key = styleKey(feature?.properties?.style);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(feature);
      }
      const prepared = [...groups.entries()].map(([key, group]) => ({
        style: parseStyleKey(key),
        features: group,
      }));
      preparedFeatureCache.set(features, prepared);
      return prepared;
    };

    const cameraKey = (currentDataKey, size, ratio) => {
      const center = map.getCenter?.() || { lat: 0, lng: 0 };
      const zoom = map.getZoom?.() ?? 0;
      return [
        // The geometry fingerprint already includes every canvas-visible style
        // and coordinate. Source object identity is intentionally excluded:
        // parent renders may replace metadata containers without changing a
        // single pixel, and that must not invalidate the presentation cache.
        currentDataKey?.geometry || String(currentDataKey || 'network'),
        zoom,
        Number(center.lat || 0).toFixed(5),
        Number(center.lng || 0).toFixed(5),
        size.x, size.y, ratio,
      ].join('|');
    };

    const rememberRaster = (key) => {
      if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement)) return;
      const snapshot = document.createElement('canvas');
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
      rasterCache.delete(key);
      rasterCache.set(key, snapshot);
      while (rasterCache.size > OVERVIEW_RASTER_CACHE_SIZE) rasterCache.delete(rasterCache.keys().next().value);
    };

    const startDraw = (drawGeneration) => {
      if (disposed || drawGeneration !== generation) return;
      const current = latestRef.current;
      const started = current.diagnostics ? performance.now() : 0;
      const features = Array.isArray(current.data?.features) ? current.data.features : [];
      const renderedFeatureCount = Number.isFinite(Number(current.reportedFeatureCount))
        ? Number(current.reportedFeatureCount)
        : features.length;
      const size = map.getSize();
      const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
      canvas.width = Math.max(1, Math.round(size.x * ratio));
      canvas.height = Math.max(1, Math.round(size.y * ratio));
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const zoom = map.getZoom?.();
      const pixelOrigin = map.getPixelOrigin?.();
      const worldScale = Number.isFinite(zoom) ? 256 * (2 ** zoom) : 0;
      const useFastProjection = Boolean(pixelOrigin && Number.isFinite(pixelOrigin.x)
        && Number.isFinite(pixelOrigin.y) && worldScale > 0);
      L.DomUtil.setPosition(canvas, topLeft);
      const context = canvas.getContext('2d');
      const cacheKey = cameraKey(current.dataKey, size, ratio);
      const cached = rasterCache.get(cacheKey);
      if (window.__atlasOverviewRasterStats) {
        const field = cached ? 'hits' : 'misses';
        window.__atlasOverviewRasterStats[field] = (window.__atlasOverviewRasterStats[field] || 0) + 1;
      }
      if (cached) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(cached, 0, 0);
        rasterCache.delete(cacheKey);
        rasterCache.set(cacheKey, cached);
        current.onProgress?.({ key: current.dataKey, renderingLinks: false, renderedLinks: renderedFeatureCount, renderError: '', overview: true });
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, size.x, size.y);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      const styleGroups = preparedStyleGroups(features);
      let groupIndex = 0;
      let groupFeatureIndex = 0;
      let batches = 0;
      let activeMs = 0;
      let maxBatchMs = 0;
      const drawBatch = () => {
        if (disposed || drawGeneration !== generation) return;
        const batchStarted = performance.now();
        const deadline = batchStarted + OVERVIEW_FRAME_BUDGET_MS;
        let batchFeatureCount = 0;
        while (groupIndex < styleGroups.length && performance.now() < deadline
          && batchFeatureCount < OVERVIEW_MAX_FEATURES_PER_FRAME) {
          const { style, features: group } = styleGroups[groupIndex];
          context.beginPath();
          context.strokeStyle = style.color;
          context.lineWidth = style.weight;
          context.globalAlpha = style.opacity;
          context.setLineDash(style.dashArray
            ? style.dashArray.split(/[ ,]+/).map(Number).filter((value) => Number.isFinite(value) && value >= 0)
            : []);
          let drewFeature = false;
          while (groupFeatureIndex < group.length
            && performance.now() < deadline
            && batchFeatureCount < OVERVIEW_MAX_FEATURES_PER_FRAME) {
            const feature = group[groupFeatureIndex];
            for (const coordinates of linesFromGeometry(feature?.geometry)) {
              let startedLine = false;
              for (const coordinate of coordinates || []) {
                let pointX;
                let pointY;
                if (useFastProjection) {
                  const normalized = normalizedMercatorPoint(coordinate);
                  if (!normalized) continue;
                  pointX = Math.round(normalized[0] * worldScale) - pixelOrigin.x - topLeft.x;
                  pointY = Math.round(normalized[1] * worldScale) - pixelOrigin.y - topLeft.y;
                } else {
                  const longitude = Number(coordinate?.[0]);
                  const latitude = Number(coordinate?.[1]);
                  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
                  const point = map.latLngToLayerPoint([latitude, longitude]).subtract(topLeft);
                  pointX = point.x;
                  pointY = point.y;
                }
                if (startedLine) context.lineTo(pointX, pointY);
                else { context.moveTo(pointX, pointY); startedLine = true; }
              }
            }
            groupFeatureIndex += 1;
            batchFeatureCount += 1;
            drewFeature = true;
          }
          if (drewFeature) context.stroke();
          if (groupFeatureIndex >= group.length) {
            groupIndex += 1;
            groupFeatureIndex = 0;
          }
        }
        const batchMs = performance.now() - batchStarted;
        batches += 1;
        activeMs += batchMs;
        maxBatchMs = Math.max(maxBatchMs, batchMs);
        if (groupIndex < styleGroups.length) {
          frame = requestAnimationFrame(drawBatch);
          return;
        }
        context.globalAlpha = 1;
        context.setLineDash([]);
        rememberRaster(cacheKey);
        current.onProgress?.({
          key: current.dataKey,
          renderingLinks: false,
          renderedLinks: renderedFeatureCount,
          renderError: '',
          overview: true,
          ...(current.diagnostics ? { diagnostics: {
            features: features.length, batches, activeMs,
            maxBatchMs, maxFeatureMs: 0, paintMs: 0,
            retireSetupMs: 0, totalMs: performance.now() - started,
          } } : {}),
        });
      };
      if (!features.length) drawBatch();
      else frame = requestAnimationFrame(drawBatch);
    };
    const scheduleDraw = () => {
      generation += 1;
      const drawGeneration = generation;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      const current = latestRef.current;
      current.onProgress?.({ key: current.dataKey, renderingLinks: true, renderedLinks: 0, renderError: '', overview: true });
      timer = setTimeout(() => {
        frame = requestAnimationFrame(() => startDraw(drawGeneration));
      }, OVERVIEW_DRAW_DEBOUNCE_MS);
    };
    redrawRef.current = scheduleDraw;
    scheduleDraw();
    map.on('resize moveend zoomend', scheduleDraw);
    return () => {
      disposed = true;
      generation += 1;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      map.off('resize moveend zoomend', scheduleDraw);
      canvas.remove();
      canvasRef.current = null;
      redrawRef.current = null;
      rasterCache.clear();
    };
  }, [map]);

  useEffect(() => {
    redrawRef.current?.();
  }, [data, dataKey, reportedFeatureCount, diagnostics, onProgress]);

  return null;
}

export { linesFromGeometry, styleKey };
