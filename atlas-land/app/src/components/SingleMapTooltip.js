import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { installMapTooltipGuard } from '../mapTooltipGuard';

export default function SingleMapTooltip() {
  const map = useMap();
  useEffect(() => installMapTooltipGuard(map), [map]);
  return null;
}
