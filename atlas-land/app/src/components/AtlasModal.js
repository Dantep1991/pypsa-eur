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
      <header className="atlas-modal__header shrink-0 flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="atlas-modal__title text-sm font-semibold">{title}</h2>
          {description && <p id={descriptionId} className="atlas-modal__description mt-1 text-xs leading-5">{description}</p>}
        </div>
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}
          className="atlas-modal__secondary-action min-h-[36px] shrink-0 rounded-lg border px-3 text-xs">
          Close
        </button>
      </header>
      <div className="atlas-modal__body min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
      {footer && <footer className="atlas-modal__footer shrink-0 border-t px-4 py-3 sm:px-5">{footer}</footer>}
    </dialog>
  );
}
