import { createPortal } from 'react-dom';

// Keep each action's existing state owner. A missing dock during mounting or
// tab changes must not briefly bring back the old floating controls.
export default function AtlasControlPortal({ target, consolidated, children }) {
  if (!consolidated) return children;
  return target ? createPortal(children, target) : null;
}
