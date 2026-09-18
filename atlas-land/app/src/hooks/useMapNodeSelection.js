import { useEffect, useRef } from 'react';

// Selection is a style update, not a new network snapshot. Replacing a GeoJSON
// layer here destroys the marker that owns an open Leaflet popup.
export function useMapNodeSelection(layerRef, layerKey, selectedNode, selectedNodes, makeIcon) {
  const applied = useRef(new WeakMap());
  useEffect(() => {
    const selected = new Set([selectedNode, ...(selectedNodes || [])]
      .filter(Boolean).map((id) => String(id).toUpperCase()));
    layerRef.current?.eachLayer((layer) => {
      const feature = layer.feature;
      const props = feature?.properties || {};
      const next = selected.has(String(feature?.id || '').toUpperCase());
      const previous = applied.current.has(layer) ? applied.current.get(layer) : Boolean(props.isSelected);
      applied.current.set(layer, next);
      if (previous === next) return;
      if (layer.setIcon) {
        layer.setIcon(makeIcon(props, next));
      } else if (layer.setStyle) {
        const emphasized = Number(props.nodeEmphasis) >= 2;
        layer.setStyle({
          color: emphasized ? (next ? '#facc15' : '#e2e8f0') : (props.color || '#3b82f6'),
          weight: emphasized ? (next ? 2.25 : 1.5) : (next ? 2 : 1),
        });
      }
    });
  }, [layerRef, layerKey, selectedNode, selectedNodes, makeIcon]);
}
