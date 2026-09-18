import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Pane, useMap } from 'react-leaflet';
import L from 'leaflet';
import { scheduleMapFeatures } from '../mapRenderScheduler';
import { createAtlasCanvas } from '../atlasCanvas';
import { retireMapLayer } from '../mapLayerRetirement';

// One committed graph plus one staging/retiring graph. A new build waits for
// retirement to finish: rapid updates cannot accumulate canvases or old routes.
export default function BatchedNetworkLayer({ data, dataKey, sourceKey, style, smoothFactor, onEachFeature,
  onProgress, diagnostics = false, onRetirementProgress }) {
  const map = useMap();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const names = [`atlas-links-${id}-a`, `atlas-links-${id}-b`];
  const [visibleSlot, setVisibleSlot] = useState(null);
  const active = useRef(null);
  const retiring = useRef(null);
  const closing = useRef(false);
  const inputs = useRef(null);
  useLayoutEffect(() => {
    closing.current = false;
    return () => { closing.current = true; };
  }, [map]);
  useLayoutEffect(() => { inputs.current = { data, style, smoothFactor, onEachFeature, onProgress, onRetirementProgress }; });
  useLayoutEffect(() => {
    names.forEach((name, slot) => {
      const pane = map.getPane(name);
      if (pane) pane.style.visibility = visibleSlot === slot ? 'visible' : 'hidden';
    });
  }, [map, visibleSlot, id]);

  const retire = useCallback((entry, profile) => {
    if (!entry?.layer && !entry?.renderer) return;
    const pane = map.getPane(entry.renderer?.options?.pane);
    if (pane) pane.style.visibility = 'hidden';
    if (profile && !closing.current) inputs.current.onRetirementProgress?.({ retiring: true });
    const job = retireMapLayer(map, entry.layer, entry.renderer, {
      onMetrics: profile ? () => {} : null,
    });
    if (!job.done) retiring.current = job;
    job.whenDone(({ metrics, error }) => {
      // A failed removal must not silently free the slot and allow unbounded
      // abandoned drawings. Keep it quarantined until the map is remounted.
      if (error) retiring.current = job;
      else if (retiring.current === job) retiring.current = null;
      if (profile && !closing.current) inputs.current.onRetirementProgress?.({ retiring: false,
        ...(metrics && !error ? { metrics } : {}), error: error ? 'Old drawing cleanup failed.' : '' });
    });
  }, [map]);

  useEffect(() => {
    closing.current = false;
    const snapshot = inputs.current;
    let entry;
    let committed = false;
    let cancelled = false;
    let cancelBuild = () => {};
    const started = diagnostics ? performance.now() : 0;
    let constructionMetrics;
    const discard = () => {
      if (entry && !committed) { const obsolete = entry; entry = null; retire(obsolete, diagnostics); }
    };
    const fail = () => {
      discard();
      if (!cancelled) inputs.current.onProgress?.({ key: dataKey, renderingLinks: false, renderedLinks: active.current?.count || 0,
        renderError: 'Could not draw the new network. The previous view has been kept.' });
    };
    snapshot.onProgress?.({ key: dataKey, renderingLinks: true, renderedLinks: active.current?.count || 0, renderError: '' });
    const build = () => {
      if (cancelled) return;
      const slot = active.current?.slot === 0 ? 1 : 0;
      entry = { slot };
      const setupStarted = diagnostics ? performance.now() : 0;
      let setupMs = 0;
      try {
        entry.renderer = createAtlasCanvas({ pane: names[slot], padding: 0.1, deferDrawing: true });
        entry.layer = L.geoJSON(undefined, {
          pane: names[slot], renderer: entry.renderer, style: snapshot.style,
          smoothFactor: snapshot.smoothFactor, onEachFeature: snapshot.onEachFeature,
        });
        entry.layer.addTo(map);
        if (diagnostics) setupMs = performance.now() - setupStarted;
      } catch (_) { fail(); return; }
      cancelBuild = scheduleMapFeatures(snapshot.data?.features || [], feature => entry.layer.addData(feature), {
        onMetrics: diagnostics ? metrics => { constructionMetrics = metrics; } : null,
        onComplete: () => {
          const paintStarted = diagnostics ? performance.now() : 0;
          entry.renderer.finishDeferredDrawing();
          const paintMs = diagnostics ? performance.now() - paintStarted : 0;
          const previous = active.current;
          const count = snapshot.data?.features?.length || 0;
          entry.count = count;
          active.current = entry;
          committed = true;
          // Swap now, before any old-path removal. The layout effect preserves it.
          const pane = map.getPane(names[slot]);
          if (pane) pane.style.visibility = 'visible';
          setVisibleSlot(slot);
          const retireStarted = diagnostics ? performance.now() : 0;
          if (previous) retire(previous, diagnostics);
          const retireSetupMs = diagnostics ? performance.now() - retireStarted : 0;
          inputs.current.onProgress?.({ key: dataKey, renderingLinks: false, renderedLinks: count, renderError: '',
            ...(diagnostics ? { diagnostics: { ...constructionMetrics, setupMs, paintMs, retireSetupMs,
              totalMs: performance.now() - started } } : {}),
          });
        },
        onError: fail,
      });
    };
    const stopWaiting = retiring.current ? retiring.current.whenDone(result => {
      if (result.error) { fail(); return; }
      build();
    }) : (build(), () => {});
    return () => { cancelled = true; stopWaiting(); cancelBuild(); discard(); };
    // Fresh callbacks/data objects alone must not rebuild identical geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, dataKey, sourceKey, diagnostics, retire]);

  useEffect(() => () => {
    closing.current = true;
    retiring.current?.finishNow();
    retiring.current = null;
    if (active.current) {
      active.current.renderer.discardDrawing?.();
      map.removeLayer(active.current.layer);
      map.removeLayer(active.current.renderer);
      active.current = null;
    }
  }, [map]);

  return <>{names.map(name => <Pane key={name} name={name}
    style={{ zIndex: 390, visibility: 'hidden' }} />)}</>;
}
