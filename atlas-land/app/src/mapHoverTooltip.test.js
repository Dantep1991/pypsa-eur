import L from 'leaflet';
import { bindMapHoverTooltip } from './mapHoverTooltip';

test('pinned popups suppress hover previews and restore them without accumulating handlers', () => {
  const layer = L.circleMarker([50, 8]);
  const content = jest.fn(() => 'Published measurements');
  const options = { sticky: true, className: 'atlas-grid-access-tooltip' };
  bindMapHoverTooltip(layer, content, options);
  expect(content).not.toHaveBeenCalled();
  for (let i = 0; i < 20; i += 1) {
    expect(layer.getTooltip().getContent()).toBe(content);
    expect(layer.getTooltip().options.sticky).toBe(true);
    layer.fire('popupopen');
    expect(layer.getTooltip()).toBeNull();
    layer.fire('mouseover');
    expect(layer.getTooltip()).toBeNull();
    layer.fire('popupclose');
    expect(layer.getTooltip().options.className).toBe(options.className);
  }
  expect(layer._events.popupopen).toHaveLength(1);
  expect(layer._events.popupclose).toHaveLength(1);
  expect(content).not.toHaveBeenCalled();
});
