import { useEffect } from 'react';
import { resultCircleRadius, resultPieDiameter } from '../modelWorkspace/resultPresentation';

// Restyle existing markers rather than remounting GeoJSON, closing popups,
// rebuilding links, moving the camera or fetching the same result again.
export function useResultMarkerSize(nodeRef, nodeKey, mixRef, mixKey, scale, createMixIcon) {
  useEffect(() => {
    nodeRef.current?.eachLayer?.(layer => {
      const props = layer.feature?.properties || {};
      if (!props.isResultPoint || !layer.setRadius) return;
      layer.setRadius(resultCircleRadius(props.facility.atlas_result_map_mode, props.resultMagnitudeRatio, scale));
    });
    mixRef.current?.eachLayer?.(layer => {
      const props = layer.feature?.properties || {};
      if (props.facility?.atlas_result_map_mode !== 'mix' || !layer.setIcon) return;
      layer.setIcon(createMixIcon(props.segments, props.extraOpacity ?? 1, props.sizeRatio ?? 1,
        true, resultPieDiameter(props.sizeRatio, scale)));
    });
  }, [nodeRef, nodeKey, mixRef, mixKey, scale, createMixIcon]);
}
