import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { mountFlowRenderer } from '../mapFlow/flowRenderer';

export default function ModelResultFlowLayer({ lines, animated = true, selectedId = '', maximum }) {
  const map = useMap();
  useEffect(() => mountFlowRenderer({ map, lines, animated, selectedId, maximum }),
    [map, lines, animated, selectedId, maximum]);
  return null;
}
