import L from 'leaflet';
import { installMapTooltipGuard } from './mapTooltipGuard';

let maps;
beforeEach(() => { maps = []; });
afterEach(() => maps.forEach(map => { map.remove(); map.getContainer().remove(); }));

function createMap() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const map = L.map(container, { zoomAnimation: false, fadeAnimation: false }).setView([50, 8], 5);
  maps.push(map);
  return map;
}

function source(map, text, options = {}) {
  return L.marker([50, 8]).addTo(map).bindTooltip(text, options);
}

function openTooltips(map) {
  const tooltips = [];
  map.eachLayer(layer => { if (layer instanceof L.Tooltip) tooltips.push(layer); });
  return tooltips;
}

test('a node tooltip replaces a connection tooltip, even in a different pane', () => {
  const map = createMap();
  map.createPane('line-capacity-tooltip-pane');
  const dispose = installMapTooltipGuard(map);
  const line = source(map, 'Reported capacity', { pane: 'line-capacity-tooltip-pane', sticky: true });
  const node = source(map, 'Price comparison');
  line.openTooltip();
  node.openTooltip();
  expect(openTooltips(map)).toEqual([node.getTooltip()]);
  expect(line.isTooltipOpen()).toBe(false);
  expect(line.getTooltip().getContent()).toBe('Reported capacity');
  dispose();
});

test('repeated overlapping hover events retain exactly one tooltip without losing bindings', () => {
  const map = createMap();
  const dispose = installMapTooltipGuard(map);
  const line = source(map, 'Line'), node = source(map, 'Node');
  for (let i = 0; i < 20; i++) {
    line.fire('mouseover');
    node.fire('mouseover');
    line.fire('mouseout');
    expect(openTooltips(map)).toEqual([node.getTooltip()]);
    node.fire('mouseout');
    expect(openTooltips(map)).toHaveLength(0);
  }
  dispose();
});

test('selected asset tooltips cannot overlap another result tooltip', () => {
  const map = createMap();
  const dispose = installMapTooltipGuard(map);
  const asset = source(map, 'Selected asset', { permanent: true });
  expect(asset.isTooltipOpen()).toBe(true);
  const result = source(map, 'Result');
  result.openTooltip();
  expect(openTooltips(map)).toEqual([result.getTooltip()]);
  dispose();
});

test('existing open tooltips are reconciled when the guard mounts', () => {
  const map = createMap();
  const first = source(map, 'First'), second = source(map, 'Second');
  first.openTooltip(); second.openTooltip();
  expect(openTooltips(map)).toHaveLength(2);
  const dispose = installMapTooltipGuard(map);
  expect(openTooltips(map)).toHaveLength(1);
  dispose();
});

test('removing the active source does not leave stale ownership', () => {
  const map = createMap();
  const dispose = installMapTooltipGuard(map);
  const old = source(map, 'Old').openTooltip();
  old.remove();
  const next = source(map, 'Next').openTooltip();
  expect(openTooltips(map)).toEqual([next.getTooltip()]);
  dispose();
});

test('cleanup and remount remove handlers and stale overlays', () => {
  const map = createMap();
  const node = source(map, 'Node');
  for (let i = 0; i < 20; i++) {
    const dispose = installMapTooltipGuard(map);
    node.openTooltip();
    dispose();
    expect(openTooltips(map)).toHaveLength(0);
    expect(map.listens('tooltipopen')).toBe(false);
    expect(map.listens('tooltipclose')).toBe(false);
  }
});

test('separate maps have independent tooltip owners', () => {
  const first = createMap(), second = createMap();
  const disposeFirst = installMapTooltipGuard(first), disposeSecond = installMapTooltipGuard(second);
  source(first, 'First map').openTooltip();
  source(second, 'Second map').openTooltip();
  expect(openTooltips(first)).toHaveLength(1);
  expect(openTooltips(second)).toHaveLength(1);
  disposeFirst(); disposeSecond();
});

test('structural region labels remain visible without taking hover ownership', () => {
  const map = createMap();
  const dispose = installMapTooltipGuard(map);
  const labels = [source(map, 'Region A', { permanent: true, atlasMapLabel: true }),
    source(map, 'Region B', { permanent: true, atlasMapLabel: true })];
  const line = source(map, 'Line').openTooltip();
  const node = source(map, 'Node').openTooltip();
  expect(line.isTooltipOpen()).toBe(false);
  expect(node.isTooltipOpen()).toBe(true);
  labels.forEach(label => expect(label.isTooltipOpen()).toBe(true));
  dispose();
  labels.forEach(label => expect(label.isTooltipOpen()).toBe(true));
});

test('an underlying line cannot steal a Supply data tooltip, but becomes available after marker mouseout', () => {
  const map = createMap(), dispose = installMapTooltipGuard(map);
  const pie = source(map, 'Supply mix: 400 MW', { atlasTooltipPriority: 20 });
  const line = source(map, 'Line capacity');
  pie.openTooltip(); line.openTooltip();
  expect(openTooltips(map)).toEqual([pie.getTooltip()]);
  pie.closeTooltip(); line.openTooltip();
  expect(openTooltips(map)).toEqual([line.getTooltip()]);
  dispose();
});

test('late line events cannot hide a Results bubble value or create overlapping tooltips', () => {
  const map = createMap(), dispose = installMapTooltipGuard(map);
  map.createPane('network-node-tooltips');
  const bubble = source(map, 'Price: 42.1234 $/MWh', { pane: 'network-node-tooltips', atlasTooltipPriority: 20 });
  const line = source(map, 'Reported capacity');
  bubble.fire('mouseover');
  for (let i = 0; i < 20; i++) {
    line.fire('mouseover');
    expect(openTooltips(map)).toEqual([bubble.getTooltip()]);
  }
  bubble.fire('mouseout'); line.fire('mouseover');
  expect(openTooltips(map)).toEqual([line.getTooltip()]);
  dispose();
});

test('a pinned input value survives line hover until unpinned; another input can replace it', () => {
  const map = createMap(), dispose = installMapTooltipGuard(map);
  const asset = source(map, 'Nuclear capacity: 482 MW', { permanent: true, atlasTooltipPriority: 40 });
  const line = source(map, 'Reported capacity: 1 MW');
  for (let i = 0; i < 20; i++) {
    line.fire('mouseover');
    expect(openTooltips(map)).toEqual([asset.getTooltip()]);
  }
  const other = source(map, 'Other capacity: 300 MW', { atlasTooltipPriority: 40 });
  other.fire('mouseover');
  expect(openTooltips(map)).toEqual([other.getTooltip()]);
  other.fire('mouseout');
  asset.closeTooltip(); line.fire('mouseover');
  expect(openTooltips(map)).toEqual([line.getTooltip()]);
  dispose();
});

test('a pinned result popup replaces hover and suppresses other tooltips until closed', () => {
  const map = createMap(), dispose = installMapTooltipGuard(map);
  const result = source(map, 'Price: -42 $/MWh', { atlasTooltipPriority: 20 }).bindPopup('Price: -42 $/MWh');
  const line = source(map, 'Line capacity');
  result.openTooltip();
  result.openPopup();
  expect(result.isPopupOpen()).toBe(true);
  expect(openTooltips(map)).toHaveLength(0);
  for (let i = 0; i < 20; i++) {
    line.fire('mouseover');
    expect(openTooltips(map)).toHaveLength(0);
  }
  result.closePopup();
  line.fire('mouseover');
  expect(openTooltips(map)).toEqual([line.getTooltip()]);
  dispose();
});

test('an already pinned popup blocks hover after guard remount without leaving handlers behind', () => {
  const map = createMap();
  const result = source(map, 'Price').bindPopup('Price: 0 $/MWh').openPopup();
  const dispose = installMapTooltipGuard(map);
  const other = source(map, 'Other price').openTooltip();
  expect(other.isTooltipOpen()).toBe(false);
  result.remove();
  other.openTooltip();
  expect(other.isTooltipOpen()).toBe(true);
  dispose();
  expect(map.listens('popupopen')).toBe(false);
  expect(map.listens('popupclose')).toBe(false);
});
