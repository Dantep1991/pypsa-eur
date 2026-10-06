// Operational status is declared by the model/scenario service. Dashes also
// denote borders and unresolved records, and are not evidence of an outage.
export const isDisabledConnection = connection => connection?.operational_state?.status === 'disabled';

export function visibleOperationalConnections(connections, showDisabled = true) {
  return showDisabled ? connections : connections.filter(connection => !isDisabledConnection(connection));
}

export function operationalConnectionStyle(connection, palette) {
  if (isDisabledConnection(connection)) {
    return { color: palette.disabled, weight: 3.5, opacity: 0.9, dashArray: '9 6' };
  }
  return null;
}
