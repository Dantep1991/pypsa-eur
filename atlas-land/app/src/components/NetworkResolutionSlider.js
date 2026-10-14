import React, { useEffect, useRef } from 'react';
import './NetworkResolutionSlider.css';

export default function NetworkResolutionSlider({ levels, index, disabled, mixed, onPreview, onCommit }) {
  const viewportRef = useRef(null);
  const selectedRef = useRef(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    const selected = selectedRef.current;
    if (!viewport || !selected || !viewport.clientWidth) return;
    const left = selected.offsetLeft;
    if (left < viewport.scrollLeft + 24 || left > viewport.scrollLeft + viewport.clientWidth - 24) {
      viewport.scrollLeft = Math.max(0, left - viewport.clientWidth / 2);
    }
  }, [index, levels.length]);

  return (
    <div className="network-resolution-slider" ref={viewportRef}>
      <div className="network-resolution-slider__scale"
        style={{ minWidth: `${Math.max(280, (levels.length - 1) * 52 + 64)}px` }}>
        <input type="range" min={0} max={levels.length - 1} step={1} value={index}
          disabled={disabled} onChange={(event) => onPreview(Number(event.target.value))}
          className="network-resolution-slider__input"
          style={{ '--resolution-progress': `${index / (levels.length - 1) * 100}%` }}
          aria-label="Network resolution"
          aria-valuetext={mixed ? 'Mixed country resolution' : levels[index]?.label || 'No network resolution selected'}
        />
        <div className="network-resolution-slider__labels">
          {levels.map((level, stop) => {
            const fraction = stop / (levels.length - 1);
            const offset = Math.round((8 - fraction * 16) * 1000) / 1000;
            return (
              <button type="button" key={level.filename} ref={stop === index ? selectedRef : null}
                onClick={() => onCommit(stop)} disabled={disabled} title={level.label}
                aria-pressed={!mixed && stop === index}
                className={`network-resolution-slider__label ${!mixed && stop === index ? 'text-tj-gold font-semibold' : 'text-tj-slate hover:text-white'}`}
                style={{ left: `calc(${fraction * 100}% ${offset < 0 ? '-' : '+'} ${Math.abs(offset)}px)` }}>
                {level.isFullNodal ? 'Nodal' : level.label === 'Bidding zone' ? 'Bidding' : level.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
