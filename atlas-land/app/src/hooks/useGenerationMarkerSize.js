import { useEffect } from 'react';

// Update icons in place: preserve the camera, hover state and map-layer identity.
export default function useGenerationMarkerSize(mixRef, mixKey, createMixIcon) {
  useEffect(() => {
    mixRef.current?.eachLayer?.(layer => {
      const p = layer.feature?.properties || {};
      if (p.facility?.atlas_result_map_mode === 'mix' || !layer.setIcon) return;
      layer.setIcon(createMixIcon(p.segments || [], p.extraOpacity ?? 1, p.sizeRatio ?? 1, p.aggregate === true));
    });
  }, [mixRef, mixKey, createMixIcon]);
}
