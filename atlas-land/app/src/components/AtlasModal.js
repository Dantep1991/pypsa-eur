import React, { useId, useLayoutEffect, useRef } from 'react';

// Use the browser's modal top layer: background map/voice controls are inert,
// keyboard navigation and Escape work without a document-wide key handler.
// Mount to open; unmount to close. Re-renders must not re-open or steal focus.
export default function AtlasModal({ title, description, onClose, children, footer }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    dialog.showModal();
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      if (opener?.isConnected && (document.activeElement === document.body || dialog.contains(document.activeElement))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="atlas-modal" aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="shrink-0 flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-white">{title}</h2>
          {description && <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-300">{description}</p>}
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}
          className="min-h-[36px] shrink-0 rounded-lg border border-white/20 px-3 text-xs text-slate-200 hover:bg-white/10 hover:text-white">
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      {footer && <footer className="shrink-0 border-t border-white/10 px-4 py-3 sm:px-5">{footer}</footer>}
    </dialog>
  );
}
