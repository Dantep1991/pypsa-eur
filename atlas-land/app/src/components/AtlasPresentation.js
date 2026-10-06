import React, { useEffect, useMemo, useRef, useState } from 'react';
import AtlasAssetInspector from "./AtlasAssetInspector";
import AtlasControlPortal from './AtlasControlPortal';
import L from 'leaflet';
import { API_BASE_URL } from '../config/api';
import { connectionGeometry } from '../atlasMapGeometry';
import { SCENE_LIMIT, candidateSites, coordinate, metricDifference, recordName, viewMetrics, siteEvidence, nearbyAccess, numeric, comparisonWithinBudget } from '../atlasPresentation';
import { ATLAS_NETWORK_CARRIER_META } from '../atlasNetworkOverlay';
import { atlasPresentationDocument, setAtlasFullscreen } from '../atlasFullscreen';
import './AtlasPresentation.css';

const carrierColors = Object.fromEntries(Object.entries(ATLAS_NETWORK_CARRIER_META).map(([key, meta]) => [key, meta.color]));
// A shared camera, not a second Leaflet instance: avoids doubling tile/network
// loading. Each side draws the complete captured topology with cooperative work.
function ComparisonCanvas({ map, before, current, split }) {
  const ref = useRef(null);
  const splitRef = useRef(split);
  splitRef.current = split;
  const frames = useMemo(() => [before, current].map(scene => {
    const nodes = new Map();
    scene.facilities.forEach(item => [item.id, item.nodeId, item.name].filter(id => id != null).forEach(id => nodes.set(String(id), item)));
    return { facilities: scene.facilities, routes: scene.connections.map(edge => connectionGeometry(
      { ...edge, from: edge.from ?? edge.fromNode, to: edge.to ?? edge.toNode }, id => nodes.get(String(id)),
    )).filter(Boolean) };
  }), [before, current]);
  useEffect(() => {
    if (!map || !ref.current) return undefined;
    let frame; let revision = 0;
    const paint = () => {
      cancelAnimationFrame(frame); const token = ++revision;
      const canvas = ref.current; const size = map.getSize(); const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = size.x * ratio; canvas.height = size.y * ratio;
      canvas.style.width = `${size.x}px`; canvas.style.height = `${size.y}px`;
      const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
      const divider = size.x * splitRef.current / 100;
      let side = 0; let index = 0; let nodes = false;
      const work = () => {
        if (token !== revision) return;
        ctx.save(); ctx.beginPath(); ctx.rect(side ? divider : 0, 0, side ? size.x - divider : divider, size.y); ctx.clip();
        ctx.strokeStyle = side ? '#facc15' : '#38bdf8'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.5;
        const data = nodes ? frames[side].facilities : frames[side].routes;
        const end = Math.min(data.length, index + 120);
        for (; index < end; index += 1) {
          if (nodes) {
            const point = coordinate(data[index]); if (!point) continue;
            const p = map.latLngToContainerPoint(point); if (p.x < -5 || p.y < -5 || p.x > size.x + 5 || p.y > size.y + 5) continue;
            ctx.beginPath(); ctx.arc(p.x, p.y, data[index].atlas_region_group_name ? 5 : 2, 0, Math.PI * 2); ctx.fill();
          } else {
            const geometry = data[index];
            for (const path of geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates]) {
              ctx.beginPath(); path.forEach(([lng, lat], pointIndex) => {
                const p = map.latLngToContainerPoint([lat, lng]);
                if (pointIndex) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
              }); ctx.stroke();
            }
          }
        }
        ctx.restore();
        if (index === data.length) { index = 0; if (!nodes) nodes = true; else { side += 1; nodes = false; } }
        if (side < 2) frame = requestAnimationFrame(work);
      };
      work();
    };
    map.on('moveend resize zoomend', paint); paint();
    return () => { revision += 1; cancelAnimationFrame(frame); map.off('moveend resize zoomend', paint); };
  }, [map, frames, split]);
  return <canvas ref={ref} className="atlas-comparison-canvas" aria-label="Baseline and current topology comparison" />;
}

export default function AtlasPresentation({ map, facilities, connections, countries, resolution, captureScene, restoreScene,
  presentationMode, onPresentationMode, busy, agentBusy, agentActivity, selection, onSelect, onInspectMode, inspectMode,
  onLandConstraintsChange, onGridAccessChange, gridAccessData, theme, registerAgentController, onOpenResultComparison, onAskModify, consolidatedControls = false, controlHost = null, showComparisonAction = true,
  onToolPanelOpenChange, toolPanelDismissRequest = 0, mapDisplayResetRequest = 0 }) {
  const [panel, setPanel] = useState('');
  // Map display shares the tool sidebar area. Hand off panel focus without
  // unmounting this state owner or losing saved presentation scenes.
  useEffect(() => { onToolPanelOpenChange?.(Boolean(panel)); }, [panel, onToolPanelOpenChange]);
  useEffect(() => () => onToolPanelOpenChange?.(false), [onToolPanelOpenChange]);
  useEffect(() => { setPanel(''); }, [toolPanelDismissRequest]);
  const [scenes, setScenes] = useState([]);
  const [activeScene, setActiveScene] = useState(null);
  const [name, setName] = useState('');
  const [baseline, setBaseline] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [split, setSplit] = useState(50);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState(null);
  const [activity, setActivity] = useState(null);
  const [radius, setRadius] = useState(50);
  const [sites, setSites] = useState([]);
  const [screening, setScreening] = useState(false);
  const [screenScope, setScreenScope] = useState(null);
  const [requireWater, setRequireWater] = useState(false);
  const [maxWaterKm, setMaxWaterKm] = useState(20);
  const pending = useRef(null);
  const latest = useRef(null);
  const lastAgent = useRef(null);
  const reset = useRef(null);
  useEffect(() => {
    if (!mapDisplayResetRequest) return;
    pending.current?.abort(); reset.current = null;
    setPanel(''); setActiveScene(null); setName(''); setBaseline(null); setComparing(false); setSplit(50);
    setNotice(''); setUndo(null); setActivity(null); setRadius(50); setSites([]); setScreening(false);
    setScreenScope(null); setRequireWater(false); setMaxWaterKm(20);
    // Saved scenes remain available; reset only clears the active visualisation.
    setAtlasFullscreen(false).catch(() => {});
  }, [mapDisplayResetRequest]);
  const metrics = useMemo(() => viewMetrics(facilities, connections), [facilities, connections]);
  const current = useMemo(() => ({ facilities, connections, metrics }), [facilities, connections, metrics]);
  const comparisonReady = useMemo(() => comparisonWithinBudget(current) && (!baseline || comparisonWithinBudget(baseline)), [current, baseline]);
  const siteAccess = useMemo(() => sites.map(site => nearbyAccess(site.point, gridAccessData)), [sites, gridAccessData]);
  const snapshot = () => ({ ...current, state: captureScene?.(), camera: map ? { center: map.getCenter(), zoom: map.getZoom() } : null,
    countries: [...countries], resolution, name: name.trim() || `Scene ${scenes.length + 1}` });
  latest.current = { snapshot, busy, facilities, connections, metrics };
  const disabled = busy || agentBusy || !map;
  const restore = (scene, fromAgent = false) => {
    if (!scene || busy || !map || (agentBusy && !fromAgent)) throw new Error('The map is still updating.');
    try {
      restoreScene?.(scene.state); map.stop();
      if (scene.camera) map.flyTo(scene.camera.center, scene.camera.zoom, { duration: 0.8, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
      setComparing(false); setNotice(`Restored ${scene.name || 'previous map view'}.`);
      setActiveScene(scene.name || null);
    } catch (error) { setNotice(error.message); if (fromAgent) throw error; }
  };
  const togglePresentation = async (enabled = !presentationMode, fromAgent = false) => {
    if (!enabled) {
      onPresentationMode?.(false);
      await setAtlasFullscreen(false);
      return;
    }
    reset.current = snapshot(); setPanel(''); onPresentationMode?.(true);
    // Speech/network callbacks do not carry browser user activation. The
    // presentation layout still works; browser fullscreen remains a UI action.
    if (fromAgent) return;
    // Nohm's Model portal is a sibling of this iframe. Fullscreen its host,
    // not this document, preserving both the portal and the assistant overlay.
    try { await setAtlasFullscreen(true); }
    catch (_) { setNotice('Presentation layout is active. Browser fullscreen is unavailable in this embedded view.'); }
  };
  useEffect(() => {
    const host = atlasPresentationDocument();
    if (!host) return undefined;
    // Changing the Model selection can reload Atlas while its host stays in
    // fullscreen. Restore the presentation layout in the new map document.
    if (host.fullscreenElement === host.documentElement) onPresentationMode?.(true);
    const changed = () => { if (!host.fullscreenElement) onPresentationMode?.(false); map?.invalidateSize?.(); };
    host.addEventListener('fullscreenchange', changed);
    return () => host.removeEventListener('fullscreenchange', changed);
  }, [map, onPresentationMode]);
  useEffect(() => {
    document.documentElement.classList.toggle('atlas-presentation-active', presentationMode);
    return () => document.documentElement.classList.remove('atlas-presentation-active');
  }, [presentationMode]);
  useEffect(() => {
    if (!agentActivity || lastAgent.current === agentActivity.id) return;
    lastAgent.current = agentActivity.id;
    const before = { ...latest.current.snapshot(), state: agentActivity.before, name: 'before AI request' };
    setUndo(before); setActivity({ text: agentActivity.text, before: before.metrics, beforeResolution: before.resolution, pending: true });
  }, [agentActivity]);
  useEffect(() => {
    if (agentBusy || busy || !activity?.pending) return;
    setActivity(previous => ({ ...previous, pending: false, summary: `${previous.beforeResolution || 'Network'} → ${resolution || 'Network'} · ${countries.join(', ')} · ${metricDifference(previous.before, latest.current.metrics)}` }));
  }, [agentBusy, busy, activity]);
  // Changes are summarized in the activity card. Do not briefly overlay
  // synthetic node highlights that can be mistaken for a result layer.
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    pending.current?.abort(); setScreening(false); setSites([]); setScreenScope(null);
  }, [facilities, countries.join(',')]);
  useEffect(() => {
    if (!map) return;
    const root = map.getContainer(); root.classList.toggle('atlas-comparing', comparing);
    return () => root.classList.remove('atlas-comparing');
  }, [map, comparing]);
  useEffect(() => { if (!comparisonReady) setComparing(false); }, [comparisonReady]);
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape') { setComparing(false); setPanel(''); onSelect?.(null); onPresentationMode?.(false); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [onPresentationMode, onSelect]);
  useEffect(() => {
    if (!selection) setPanel(previous => previous === 'inspect' ? '' : previous);
  }, [selection]);
  useEffect(() => {
    if (!map || !selection) return undefined;
    const layer = L.layerGroup().addTo(map);
    const item = selection.record;
    if (selection.kind === 'node' && coordinate(item)) L.circleMarker(coordinate(item), { radius: 13, color: '#2dd4bf', fillOpacity: 0.1, interactive: false }).addTo(layer);
    if (selection.kind === 'link') {
      const resolve = id => facilities.find(node => [node.id, node.nodeId, node.name].some(value => value != null && String(value) === String(id)));
      const geometry = connectionGeometry({ ...item, from: item.from ?? item.fromNode, to: item.to ?? item.toNode }, resolve);
      if (geometry) for (const path of geometry.type === 'MultiLineString' ? geometry.coordinates : [geometry.coordinates]) {
        L.polyline(path.map(([lng, lat]) => [lat, lng]), { color: '#2dd4bf', weight: 5, interactive: false }).addTo(layer);
        for (const point of [path[0], path[path.length - 1]]) L.circleMarker([point[1], point[0]], { radius: 7, color: '#2dd4bf', interactive: false }).addTo(layer);
      }
    }
    setNotice(''); setPanel('inspect');
    return () => layer.remove();
  }, [map, selection, facilities]);
  const screen = async (searchRadius = radius) => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    const center = map.getCenter(); const scope = [center.lat, center.lng];
    const candidates = candidateSites(facilities, scope, searchRadius);
    setScreenScope({ center: scope, radius: searchRadius }); setSites(candidates.map(site => ({ ...site, loading: true }))); setScreening(true);
    if (!candidates.length) { setNotice('No eligible electricity buses within this radius. Load the electricity Grid, zoom to your area and try again. Regional markers are excluded.'); setScreening(false); return; }
    let index = 0;
    const worker = async () => {
      while (index < candidates.length && !controller.signal.aborted) {
        const i = index++; const candidate = candidates[i];
        const request = new AbortController();
        const abort = () => request.abort(); controller.signal.addEventListener('abort', abort);
        const timer = setTimeout(abort, 15000);
        let result;
        try {
          const query = new URLSearchParams({ lat: candidate.point[0], lng: candidate.point[1] });
          if (countries.length) query.set('countries', countries.join(','));
          const response = await fetch(`${API_BASE_URL}/api/atlas/land/inspect?${query}`, { signal: request.signal });
          if (!response.ok) throw new Error(`Land evidence unavailable (${response.status})`);
          const land = await response.json(); result = { land };
        } catch (error) { result = { error: request.signal.aborted ? 'Land evidence request cancelled or timed out' : error.message }; }
        finally { clearTimeout(timer); controller.signal.removeEventListener('abort', abort); }
        if (!controller.signal.aborted) setSites(previous => previous.map((site, j) => j === i ? { ...candidate, ...result, loading: false } : site));
      }
    };
    await Promise.all([worker(), worker()]);
    if (pending.current === controller) setScreening(false);
  };
  useEffect(() => {
    if (!map || !screenScope) return undefined;
    const layer = L.layerGroup().addTo(map);
    L.circle(screenScope.center, { radius: screenScope.radius * 1000, color: '#818cf8', weight: 1, fillOpacity: 0.03, interactive: false }).addTo(layer);
    sites.forEach((site, index) => L.circleMarker(site.point, { radius: 8, color: site.land?.protected === true ? '#ef4444' : '#f59e0b', fillOpacity: 0.6 })
      .bindTooltip(String(index + 1), { permanent: true, direction: 'top' }).on('click', () => onSelect({ kind: 'node', record: site.item })).addTo(layer));
    return () => layer.remove();
  }, [map, sites, screenScope, onSelect]);
  const saveScene = (sceneName = name.trim() || `Scene ${scenes.length + 1}`) => {
    if (!facilities.length) throw new Error('Load a network before saving a scene.');
    if (scenes.length >= SCENE_LIMIT) throw new Error(`The scene limit is ${SCENE_LIMIT}. Delete a scene first.`);
    if (!sceneName.trim() || sceneName.length > 70) throw new Error('Use a scene name between 1 and 70 characters.');
    if (scenes.some(scene => scene.name.toLowerCase() === sceneName.trim().toLowerCase())) throw new Error('That scene name already exists. Choose another name.');
    setScenes(previous => [...previous, { ...snapshot(), name: sceneName.trim() }]);
    setActiveScene(sceneName.trim()); setName(''); setNotice('Scene saved with its already-loaded datasets.');
  };
  const captureBaseline = (label = 'Saved baseline') => {
    if (!facilities.length) throw new Error('Load a network before capturing a baseline.');
    setBaseline({ ...snapshot(), name: label }); setNotice('Baseline captured. Change countries, resolution or layers, then compare.');
  };
  const cancelScreening = () => {
    pending.current?.abort(); setScreening(false);
    setSites(previous => previous.map(site => site.loading ? { ...site, loading: false, error: 'Check cancelled' } : site));
  };
  const showEvidence = () => {
    onLandConstraintsChange?.({ enabled: true, panelOpen: true });
    onGridAccessChange?.({ enabled: true, panelOpen: false });
  };
  const execute = async (params = {}) => {
    const action = params.action;
    if ((busy || !map) && !['cancel_screening', 'close_panel', 'exit_present'].includes(action)) throw new Error('The map is still updating. Try when the network is ready.');
    const bounded = (value, min, max, label) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
      return value;
    };
    const findScene = () => {
      const matches = scenes.filter(scene => scene.name.toLowerCase() === String(params.name || '').trim().toLowerCase());
      if (matches.length !== 1) throw new Error(`Choose a saved scene: ${scenes.map(scene => scene.name).join(', ') || 'none saved yet'}.`);
      return matches[0];
    };
    switch (action) {
      case 'present': if (!presentationMode) await togglePresentation(true, true); break;
      case 'exit_present': await togglePresentation(false, true); break;
      case 'open_scenes': setPanel('scenes'); break;
      case 'save_scene': saveScene(params.name); setPanel('scenes'); break;
      case 'restore_scene': restore(findScene(), true); setPanel('scenes'); break;
      case 'delete_scene': { const scene = findScene(); setScenes(previous => previous.filter(item => item !== scene)); if (activeScene === scene.name) setActiveScene(null); break; }
      case 'next_scene':
      case 'previous_scene': {
        if (!scenes.length) throw new Error('Save a scene first.');
        const index = scenes.findIndex(scene => scene.name === activeScene);
        const next = index < 0 ? (action === 'next_scene' ? 0 : scenes.length - 1) : (index + (action === 'next_scene' ? 1 : -1) + scenes.length) % scenes.length;
        restore(scenes[next], true); break;
      }
      case 'reset_presentation': if (!reset.current) throw new Error('Start a presentation first.'); restore(reset.current, true); break;
      case 'open_compare': if (onOpenResultComparison) { setPanel(''); onOpenResultComparison(); return 'Result comparison opened. Choose a baseline and candidate solution, then compare on map.'; } else setPanel('compare'); break;
      case 'capture_baseline':
        if (onOpenResultComparison) throw new Error('Topology snapshots are no longer used for model comparison. Choose a baseline result solution in Compare.');
        captureBaseline(params.name); setPanel('compare'); break;
      case 'show_comparison':
        if (onOpenResultComparison) { setPanel(''); onOpenResultComparison(); return 'Result comparison opened; no delta has been applied yet.'; }
        if (!baseline) throw new Error('Capture a baseline before comparing.');
        if (!comparisonReady) throw new Error('Reduce the geographic scope to fit the interactive comparison budget.');
        setComparing(true); setPanel('compare'); break;
      case 'stop_comparison': setComparing(false); break;
      case 'set_comparison_split':
        if (onOpenResultComparison) throw new Error('The topology divider was replaced by result deltas.');
        setSplit(bounded(params.split, 5, 95, 'Comparison divider')); break;
      case 'inspect': {
        if (params.asset_id != null) {
          const nodes = facilities.filter(item => [item.id, item.nodeId, item.name].some(id => id != null && String(id) === String(params.asset_id))).map(record => ({ kind: 'node', record }));
          const links = connections.filter(item => String(item.id) === String(params.asset_id)).map(record => ({ kind: 'link', record }));
          const matches = [...nodes, ...links].filter(item => !params.asset_kind || item.kind === params.asset_kind);
          if (matches.length !== 1) throw new Error('Asset ID is missing or ambiguous. Select a map feature or specify its exact ID and kind.');
          onSelect(matches[0]);
        }
        onInspectMode(true); setPanel('inspect'); break;
      }
      case 'stop_inspect': onInspectMode(false); if (panel === 'inspect') setPanel(''); break;
      case 'open_sites': setPanel('sites'); break;
      case 'configure_sites':
      case 'screen_sites': {
        const nextRadius = params.radius_km === undefined ? radius : bounded(params.radius_km, 1, 500, 'Search radius');
        const nextWater = params.max_water_km === undefined ? maxWaterKm : bounded(params.max_water_km, 1, 500, 'Water distance');
        if (params.require_water !== undefined && typeof params.require_water !== 'boolean') throw new Error('Water proximity must be true or false.');
        setRadius(nextRadius); setMaxWaterKm(nextWater);
        if (params.require_water !== undefined) setRequireWater(params.require_water);
        setPanel('sites');
        if (action === 'screen_sites') await screen(nextRadius);
        break;
      }
      case 'cancel_screening': cancelScreening(); break;
      case 'show_site_evidence': showEvidence(); break;
      case 'select_site': {
        const index = bounded(params.site_index, 1, sites.length, 'Candidate number') - 1;
        if (!Number.isInteger(index)) throw new Error('Use a whole candidate number.');
        map.stop(); map.flyTo(sites[index].point, 10); onSelect({ kind: 'node', record: sites[index].item }); break;
      }
      case 'close_panel': setPanel(''); break;
      case 'undo': if (!undo) throw new Error('No previous AI map change is available.'); restore(undo, true); setUndo(null); setActivity(null); break;
      default: throw new Error('Unknown presentation or evidence action.');
    }
    return `Atlas ${action.replace(/_/g, ' ')} applied${params.name ? `: ${params.name}` : ''}.`;
  };
  latest.current.execute = execute;
  latest.current.state = { busy: busy || !map, presentationMode, panel, scenes: scenes.map(scene => scene.name), activeScene,
    baseline: baseline?.name || null, comparing, comparisonReady, split, inspectMode,
    selectedAsset: selection ? { id: selection.record.id, kind: selection.kind, name: recordName(selection.record) } : null,
    radiusKm: radius, requireWater, maxWaterKm, screening, candidates: sites.map((site, index) => ({ index: index + 1, id: site.item.id, name: recordName(site.item), loading: site.loading, error: site.error || null })),
    canResetPresentation: Boolean(reset.current), canUndo: Boolean(undo), sceneLimit: SCENE_LIMIT };
  useEffect(() => {
    registerAgentController?.({ execute: params => latest.current.execute(params), getState: () => latest.current.state });
    return () => registerAgentController?.(null);
  }, [registerAgentController]);
  const button = (title, key) => <button type="button" aria-pressed={panel === key} onClick={() => { setNotice(''); setPanel(panel === key ? '' : key); }}>{title}</button>;
  return <div className={`atlas-experience ${presentationMode ? 'is-presenting' : ''}`} data-theme={theme}>
    <AtlasControlPortal consolidated={consolidatedControls} target={controlHost}>
    <div className="atlas-experience-bar" role="toolbar" aria-label="Presentation and evidence tools">
      <button type="button" disabled={disabled && !presentationMode} aria-pressed={presentationMode} onClick={() => togglePresentation()}>{presentationMode ? 'Exit presentation' : 'Present'}</button>
      {button('Scenes', 'scenes')}{showComparisonAction && (onOpenResultComparison ? <button type="button" onClick={() => { setPanel(''); onOpenResultComparison(); }}>Compare</button> : button('Compare', 'compare'))}
      {button('Find a site', 'sites')}
    </div>
    </AtlasControlPortal>
    {activity && <div className="atlas-activity" role="status"><strong>{activity.pending ? 'EMIL is updating the map' : 'Map update finished'}</strong><span>{activity.text}</span><span>{activity.summary}</span><small>Counts describe the displayed data, not verification of the request.</small><button disabled={disabled || !undo} onClick={() => { restore(undo); setUndo(null); setActivity(null); }}>Undo map change</button><button aria-label="Dismiss map activity" onClick={() => setActivity(null)}>×</button></div>}
    {comparing && baseline && <><ComparisonCanvas map={map} before={baseline} current={current} split={split} /><div className="atlas-comparison-labels"><span>Baseline: {baseline.name}</span><span>Current view</span></div><div className="atlas-comparison-divider" style={{ left: `${split}%` }} /><input className="atlas-comparison-slider" type="range" min="5" max="95" value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Comparison divider" /></>}
    {panel && <section className={`atlas-experience-panel ${panel === 'inspect' ? 'atlas-inspect-panel' : ''}`} aria-label={`${panel} panel`}>
      <header><strong>{{ scenes: 'Presentation scenes', compare: 'Compare topology', inspect: 'Asset inspector', sites: 'Find a site' }[panel]}</strong><button aria-label="Close presentation panel" onClick={() => { if (panel === 'inspect') onSelect?.(null); setPanel(''); }}>×</button></header>
      {notice && <p role="status">{notice}</p>}
      {panel === 'scenes' && <>
        <p>Save the loaded map and camera. Up to {SCENE_LIMIT} scenes, kept in memory until this page closes.</p>
        <label>Scene name<input value={name} maxLength={70} onChange={event => setName(event.target.value)} placeholder="e.g. France in detail" /></label>
        <button disabled={disabled || scenes.length >= SCENE_LIMIT || !facilities.length} onClick={() => { try { saveScene(); } catch (error) { setNotice(error.message); } }}>Save current scene</button>
        {scenes.map((scene, index) => <div className="atlas-scene" key={index}><button disabled={disabled} onClick={() => restore(scene)}>{scene.name}</button><button aria-label={`Delete scene ${scene.name}`} onClick={() => setScenes(previous => previous.filter((_, i) => i !== index))}>×</button></div>)}
        <button disabled={disabled || !reset.current} onClick={() => restore(reset.current)}>Reset to presentation start</button>
        <small>Map-view restoration only. Model runs and external operations are not undone.</small>
      </>}
      {panel === 'compare' && <>
        <p>Capture a baseline, change the map, then reveal both topologies using the divider. Both sides share the same camera.</p>
        <button disabled={disabled || !facilities.length} onClick={() => captureBaseline(name.trim() || 'Saved baseline')}>Capture baseline</button>
        <button disabled={!baseline || disabled || !comparisonReady} onClick={() => setComparing(!comparing)}>{comparing ? 'Stop comparison' : 'Show comparison'}</button>
        {!comparisonReady && <p>Reduce the geographic scope for comparison. This view exceeds the interactive comparison budget (100,000 records or 250,000 route vertices); nothing is silently omitted.</p>}
        {baseline && <p>{metricDifference(baseline.metrics, metrics)}</p>}
        <small>Blue: baseline · Gold: current. Displayed topology only; land, access and result overlays are not compared.</small>
      </>}
      {panel === "inspect" && <AtlasAssetInspector selection={selection} facilities={facilities} connections={connections} onSelect={onSelect} onAskModify={onAskModify} />}
      {panel === 'sites' && <>
        <p>Centre the map on your search area. Screen up to six nearby electricity nodes, ordered by distance—not a suitability score.</p>
        <label>Search radius (km)<input type="number" min="1" max="500" value={radius} onChange={event => setRadius(Number(event.target.value))} /></label>
        <label><input type="checkbox" checked={requireWater} onChange={event => setRequireWater(event.target.checked)} />Check water proximity</label>
        {requireWater && <label>Maximum water distance (km)<input type="number" min="1" max="500" value={maxWaterKm} onChange={event => setMaxWaterKm(Number(event.target.value))} /></label>}
        <button disabled={disabled || screening || !Number.isFinite(radius) || radius < 1 || radius > 500 || (requireWater && (!Number.isFinite(maxWaterKm) || maxWaterKm < 1 || maxWaterKm > 500))} onClick={() => screen()}>{screening ? 'Checking land evidence…' : 'Screen around map centre'}</button>
        {screening && <button onClick={() => { pending.current?.abort(); setScreening(false); setSites(previous => previous.map(site => site.loading ? { ...site, loading: false, error: 'Check cancelled' } : site)); }}>Cancel checks</button>}
        <button onClick={() => { onLandConstraintsChange?.({ enabled: true, panelOpen: true }); onGridAccessChange?.({ enabled: true, panelOpen: false }); }}>Show land and grid-access evidence</button>
        <p>Candidate nodes are network locations, not available parcels. Aggregated nodes may be regional representatives. Power headroom, water availability and connection dates require verification.</p>
        {siteAccess.some(Boolean) && <details open><summary>Nearby published grid-access evidence (not matched connections)</summary>{siteAccess.map((access, index) => access && <p key={index}>Candidate {index + 1}: {String(access.properties.name || 'Unnamed access site')} · {access.distance.toFixed(1)} km away · published available access: {numeric(access.properties.available_mw) === null ? 'Unknown' : `${numeric(access.properties.available_mw)} MW`} · queued: {numeric(access.properties.queued_mw) === null ? 'Unknown' : `${numeric(access.properties.queued_mw)} MW`} · target: {String(access.properties.earliest_target_date || 'Not published')}. Sources: {(access.properties.source_keys || []).join(', ') || 'Not supplied'}. Proximity does not establish electrical connectivity or a connection offer.</p>)}</details>}
        {sites.map((site, index) => <article key={site.item.id} className="atlas-site"><strong>{siteEvidence(site, { requireWater, maxWaterKm })}</strong><button onClick={() => { map.stop(); map.flyTo(site.point, 10, { duration: 0.8, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }); onSelect({ kind: 'node', record: site.item }); }}>{index + 1}. {recordName(site.item)}</button><p>{site.distance.toFixed(1)} km from centre</p><p>Land: {site.loading ? 'Checking…' : site.error || (site.land?.in_scope === false ? 'Outside land evidence scope' : site.land?.land_cover?.label || 'Unknown')}</p><p>Protection: {site.land?.protected === true ? 'Natura 2000 flag — review exclusion' : site.land?.protected === false ? 'Not flagged by this local mask; not clearance' : 'Unknown'}</p><p>Nearest loaded water asset: {site.nearestWater ? `${site.nearestWater.name} (${site.nearestWater.distance.toFixed(1)} km)` : 'Unknown — load Water assets for proximity evidence'}</p><p>Connection availability: Unknown · Water supply capacity: Unknown</p></article>)}
      </>}
    </section>}
    {!consolidatedControls && presentationMode && !activity && <div className="atlas-presentation-legend"><span>Loaded carriers:</span>{Object.entries(carrierColors).filter(([carrier]) => facilities.some(item => (item.atlas_network_carrier || 'electricity') === carrier)).map(([carrier]) => <span key={carrier}>{carrier === 'gas' ? 'Methane' : carrier}</span>)}<span>Source-dependent coverage</span></div>}
  </div>;
}
