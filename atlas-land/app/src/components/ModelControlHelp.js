import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function ModelControlHelp({ label, children }) {
  const id = useId();
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);
  const open = Boolean(position);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setPosition(null);
    const onPointerDown = (event) => {
      if (!buttonRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const width = Math.min(290, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = rect.bottom + 8 + 220 > window.innerHeight
      ? Math.max(12, rect.top - 228)
      : rect.bottom + 8;
    setPosition({ top, left, width });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`About ${label}`}
        className="atlas-model-help__button"
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && createPortal(
        <div ref={popoverRef} id={id} role="note" aria-label={`About ${label}`} className="atlas-model-help__popover" style={position}>
          <strong className="atlas-model-help__title">{label}</strong>
          <div className="atlas-model-help__content">{children}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
