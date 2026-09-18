// A pinned inspection card replaces its hover preview. Unbinding (rather than
// only closing) also prevents pointer movement during auto-pan reopening it.
export function bindMapHoverTooltip(layer, content, options) {
  layer.bindTooltip(content, options);
  layer.on('popupopen', () => layer.unbindTooltip());
  layer.on('popupclose', () => layer.bindTooltip(content, options));
}
