import React from 'react';
import { Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { WorkspaceLauncher } from './AtlasWorkspacePanels';
import ResultMarkerSizeControl from './ResultMarkerSizeControl';
import './AtlasMapControlSlots.css';

export default function AtlasMapControlSlots({ networkRef, layersRef, overlaysRef, presentationRef,
  showDataBubbles = true, onDataBubblesChange, piesAvailable = false, pieSize = 1, onPieSizeChange,
  onReset, resetDisabled = false }) {
  return <WorkspaceLauncher title="Map display" Icon={SlidersHorizontal}>
    <section className="atlas-map-control-slots" aria-label="Map controls">
    <div className="atlas-control-network" ref={networkRef} />
    <div className="atlas-control-layers" ref={layersRef} />
    <button type="button" className="atlas-data-bubbles-toggle" aria-label="Bubbles & pies"
      aria-pressed={showDataBubbles} onClick={() => onDataBubblesChange?.(!showDataBubbles)}>
      {showDataBubbles ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
      <span>Bubbles &amp; pies</span><span aria-hidden="true">{showDataBubbles ? 'Shown' : 'Hidden'}</span>
    </button>
    {showDataBubbles && piesAvailable && <ResultMarkerSizeControl label="Pie size" value={pieSize} onChange={onPieSizeChange} />}
    <div className="atlas-control-overlays" ref={overlaysRef} />
    <div className="atlas-control-presentation" ref={presentationRef} />
    <button type="button" className="atlas-map-display-reset" onClick={onReset} disabled={resetDisabled}
      title="Restore the default map and clear visualisations, overlays and display filters. The selected model stays unchanged.">
      <RotateCcw size={16} aria-hidden="true" /><span>Reset map display</span>
    </button>
    </section>
  </WorkspaceLauncher>;
}
