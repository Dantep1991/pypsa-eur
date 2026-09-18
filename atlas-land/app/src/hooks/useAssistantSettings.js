import { useEffect, useId, useRef, useState } from 'react';

export const SHORT_ASSISTANT_QUERY = '(max-height: 600px)';

export function useAssistantSettings() {
  const [short, setShort] = useState(() => (
    typeof window !== 'undefined' && Boolean(window.matchMedia?.(SHORT_ASSISTANT_QUERY).matches)
  ));
  const [expanded, setExpanded] = useState(!short);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const query = window.matchMedia(SHORT_ASSISTANT_QUERY);
    const update = () => {
      setShort(query.matches);
      if (query.matches) {
        // Do not strand keyboard focus inside controls being collapsed.
        if (panelRef.current?.contains(document.activeElement)) {
          toggleRef.current?.focus({ preventScroll: true });
        }
        setExpanded(false);
      }
      // Growing the window must not override an explicit collapsed preference.
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return { short, expanded, toggleRef, panelRef, panelId,
    coverConversation: short && expanded,
    showConversation: () => { if (short) setExpanded(false); },
    toggle: () => setExpanded(value => !value) };
}
