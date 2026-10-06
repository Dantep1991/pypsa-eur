// Display motion only: neither flow magnitude nor simulation time is changed.
export const FLOW_SPEED_MIN = 0.25;
export const FLOW_SPEED_MAX = 3;
export const FLOW_SPEED_DEFAULT = 1;
export const FLOW_TRAVEL_SECONDS = 6;

export function flowAnimationSpeed(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(FLOW_SPEED_MAX, Math.max(FLOW_SPEED_MIN, value)) : FLOW_SPEED_DEFAULT;
}

export function flowIdentityPhase(id) {
  return [...String(id)].reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 997, 0) / 997;
}

// Integrate progress, not timestamp × current speed: changing speed must not
// teleport arrows. Normalised progress also survives reprojection on map zoom.
export function createFlowMotionClock(travelSeconds = FLOW_TRAVEL_SECONDS) {
  let progress = 0, previous = null, speed = FLOW_SPEED_DEFAULT;
  return {
    setSpeed(value) { speed = flowAnimationSpeed(value); },
    pause() { previous = null; },
    tick(timestamp, active = true) {
      if (!active) { previous = null; return progress; }
      if (previous != null) {
        const delta = Math.min(0.1, Math.max(0, (timestamp - previous) / 1000));
        progress = (progress + delta * speed / travelSeconds) % 1;
      }
      previous = timestamp;
      return progress;
    },
  };
}
