import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { mountFlowRenderer } from '../mapFlow/flowRenderer';

export default function ModelResultFlowLayer({ lines, animated = true, selectedId = '', maximum, animationSpeed }) {
  const map = useMap();
  const renderer = useRef(null);
  useEffect(() => {
    renderer.current = mountFlowRenderer({ map, lines, animated, selectedId, maximum, animationSpeed });
    return () => { renderer.current?.(); renderer.current = null; };
  }, [map]);
  useEffect(() => renderer.current?.update({ lines, animated, selectedId, maximum, animationSpeed }),
    [lines, animated, selectedId, maximum, animationSpeed]);
  return null;
}
