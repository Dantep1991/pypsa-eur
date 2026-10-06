import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function MapDisplayBackButton({ onClick }) {
  if (!onClick) return null;
  return <button type="button" className="atlas-map-display-back" onClick={onClick}>
    <ArrowLeft size={15} aria-hidden="true" />Back to Map display
  </button>;
}
