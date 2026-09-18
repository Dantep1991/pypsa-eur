export const shouldExecuteViewportCommand = (lastExecutedId, nextCommandId) => (
  nextCommandId !== null
  && nextCommandId !== undefined
  && nextCommandId !== ''
  && lastExecutedId !== nextCommandId
);

// Claim a camera command before Leaflet emits synchronous move/zoom events.
// Completed commands must also leave parent state so a map remount cannot
// replay them. Only acknowledge the matching command, never a newer request.
export const applyViewportCommandOnce = (consumedRef, commandId, map, move, onApplied) => {
  if (!map || !shouldExecuteViewportCommand(consumedRef.current, commandId)) return false;
  consumedRef.current = commandId;
  map.closePopup?.();
  map.stop();
  move();
  onApplied?.(commandId);
  return true;
};

export const clearAppliedViewportCommand = (pendingCommand, appliedId) => (
  pendingCommand?.id === appliedId ? null : pendingCommand
);
